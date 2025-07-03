import React, { useState, useRef, useEffect } from 'react'
import { Video, Mic, MicOff, VideoOff, Play, Square, Upload, AlertCircle } from 'lucide-react'

interface StreamControlsProps {
  isStreaming: boolean
  setIsStreaming: (streaming: boolean) => void
  setConnectionStatus: (status: 'disconnected' | 'connecting' | 'connected' | 'error') => void
  setStreamStats: (stats: any) => void
  setStreamId: (streamId: string | null) => void
}

const StreamControls: React.FC<StreamControlsProps> = ({
  isStreaming,
  setIsStreaming,
  setConnectionStatus,
  setStreamStats,
  setStreamId
}) => {
  const [whipUrl, setWhipUrl] = useState('http://localhost:8088/gateway/process/request/stream/start')
  const [videoEnabled, setVideoEnabled] = useState(true)
  const [audioEnabled, setAudioEnabled] = useState(true)
  const [fpsLimit, setFpsLimit] = useState(30)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [peerConnection, setPeerConnection] = useState<RTCPeerConnection | null>(null)
  const [currentStreamId, setCurrentStreamId] = useState<string | null>(null)
  const [latestOffer, setLatestOffer] = useState<string>('')
  const [latestAnswer, setLatestAnswer] = useState<string>('')
  const videoRef = useRef<HTMLVideoElement>(null)
  const statsIntervalRef = useRef<number | null>(null)
  const keyframeIntervalRef = useRef<number | null>(null)
  const lastStatsRef = useRef({
    time: 0,
    bytes: 0,
    frameTime: 0,
    frameCount: 0
  })

  useEffect(() => {
    return () => {
      if (statsIntervalRef.current) {
        clearInterval(statsIntervalRef.current)
        statsIntervalRef.current = null
      }
      if (keyframeIntervalRef.current) {
        clearInterval(keyframeIntervalRef.current)
        keyframeIntervalRef.current = null
      }
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop())
      }
      if (peerConnection) {
        peerConnection.close()
      }
    }
  }, [localStream, peerConnection])

  const startStream = async () => {
    if (!whipUrl) {
      alert('Please enter a WHIP URL')
      return
    }

    try {
      setConnectionStatus('connecting')
      
      // Get user media
      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoEnabled ? {
          frameRate: { ideal: fpsLimit, max: fpsLimit }
        } : false,
        audio: audioEnabled
      })
      
      setLocalStream(stream)
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }

      // Create peer connection
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' }
        ]
      })

      setPeerConnection(pc)

      // Add tracks to peer connection
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream)
      })

      // Create offer
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      
      // Store the offer SDP
      setLatestOffer(offer.sdp)

      // Wait for ICE candidates with a timeout
      let iceCandidates: RTCIceCandidate[] = [];
      
      await new Promise<void>((resolve) => {
        // Set a timeout to avoid waiting forever - 2 seconds max wait time
        const timeoutId = setTimeout(() => {
          console.log('ICE gathering timeout reached, continuing with available candidates');
          resolve();
        }, 2000);
        
        // Listen for ICE candidates
        pc.addEventListener('icecandidate', (event) => {
          if (event.candidate) {
            iceCandidates.push(event.candidate);
          } else {
            // Null candidate means we've gathered all we can
            console.log('ICE gathering complete, all candidates received');
            clearTimeout(timeoutId);
            resolve();
          }
        });
      });
      
      console.log(`Gathered ${iceCandidates.length} ICE candidates, sending WHIP offer`);
      
      // Get the current SDP with all gathered candidates
      const currentSdp = pc.localDescription?.sdp;
      if (!currentSdp) {
        throw new Error('No local description available');
      }
      
      // Log SDP length to verify it contains candidates
      console.log(`Original offer SDP length: ${offer.sdp.length}`);
      console.log(`Updated SDP length with candidates: ${currentSdp.length}`);
      // The updated SDP should be longer as it contains the ICE candidates
      
      // Send WHIP offer with all candidates included in the SDP
      const livepeerHeader = btoa(JSON.stringify(
                                        { 
                                          "request": JSON.stringify({"start_stream": true}),
                                          "parameters": JSON.stringify({}),
                                          "capability": 'webrtc-stream',
                                          "timeout_seconds": 30
                                        }
                                      )
                                    )
      const response = await fetch(whipUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/sdp',
          'Livepeer': livepeerHeader
        },
        body: currentSdp // Use the updated SDP with all gathered candidates
      })

      if (response.status == 201) {
        const answerSdp = await response.text()
        const streamId = response.headers.get('X-Stream-Id')
        
        // Store the answer SDP
        setLatestAnswer(answerSdp)
        
        await pc.setRemoteDescription(new RTCSessionDescription({
          type: 'answer',
          sdp: answerSdp
        }))

        setIsStreaming(true)
        setConnectionStatus('connected')
        setStreamId(streamId)
        setCurrentStreamId(streamId)
        
        // Start collecting real-time stats
        statsIntervalRef.current = window.setInterval(() => {
          collectPublisherStats(pc)
        }, 1000) // Update stats every second
        
        // Start generating keyframes every 2 seconds
        keyframeIntervalRef.current = window.setInterval(() => {
          generateKeyframe(pc)
        }, 2000) // Generate keyframe every 2 seconds
        
        // Initial stats update
        setTimeout(() => collectPublisherStats(pc), 1000)
      } else {
        throw new Error('Failed to send WHIP offer')
      }

    } catch (error) {
      console.error('Error starting stream:', error)
      setConnectionStatus('error')
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop())
      }
    }
  }

  const stopStream = async () => {
    try {
      // Send stop request to server if we have a stream ID
      if (currentStreamId) {
        console.log(`Stopping stream with ID: ${currentStreamId}`);
        
        const stopUrl = whipUrl.replace('/stream/start', '/stream/stop');
        const requestData = {
          "request": JSON.stringify({"stop_stream": true, "stream_id": currentStreamId}),
          "parameters": JSON.stringify({}),
          "capability": 'webrtc-stream',
          "timeout_seconds": 30
        };
        
        const livepeerHeader = btoa(JSON.stringify(requestData));
        
        const response = await fetch(stopUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Livepeer': livepeerHeader
          },
          body: JSON.stringify({ stream_id: currentStreamId })
        });
        
        if (response.ok) {
          console.log('Stream stop request sent successfully');
        } else {
          console.warn('Failed to send stream stop request:', response.status);
        }
      }
    } catch (error) {
      console.error('Error sending stop request:', error);
    }
    
    // Clear stats collection interval
    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current)
      statsIntervalRef.current = null
    }
    
    // Clear keyframe generation interval
    if (keyframeIntervalRef.current) {
      clearInterval(keyframeIntervalRef.current)
      keyframeIntervalRef.current = null
    }
    
    // Reset stats tracking
    lastStatsRef.current = {
      time: 0,
      bytes: 0,
      frameTime: 0,
      frameCount: 0
    }
    
    // Clean up local resources regardless of stop request success
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop())
      setLocalStream(null)
    }
    
    if (peerConnection) {
      peerConnection.close()
      setPeerConnection(null)
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null
    }

    setIsStreaming(false)
    setConnectionStatus('disconnected')
    setStreamId(null)
    setCurrentStreamId(null)
    setLatestOffer('')
    setLatestAnswer('')
    setStreamStats({
      bitrate: 0,
      fps: 0,
      resolution: '',
      latency: 0,
      streamId: null
    })
  }

  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0]
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled
        setVideoEnabled(videoTrack.enabled)
      }
    }
  }

  const toggleAudio = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0]
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled
        setAudioEnabled(audioTrack.enabled)
      }
    }
  }

  // Function to collect real-time stats from the peer connection for publisher
  const collectPublisherStats = async (pc: RTCPeerConnection) => {
    try {
      const stats = await pc.getStats()
      let bitrate = 0
      let fps = 0
      let resolution = ''
      let latency = 0

      stats.forEach((report) => {
        if (report.type === 'outbound-rtp' && report.mediaType === 'video') {
          // Calculate bitrate from bytes sent
          if (report.bytesSent !== undefined) {
            const now = Date.now()
            const currentBytes = report.bytesSent
            
            // Store previous values for calculation
            if (!lastStatsRef.current.time || !lastStatsRef.current.bytes) {
              lastStatsRef.current.time = now
              lastStatsRef.current.bytes = currentBytes
              return
            }
            
            const timeDiff = (now - lastStatsRef.current.time) / 1000 // seconds
            const bytesDiff = currentBytes - lastStatsRef.current.bytes
            
            if (timeDiff > 0) {
              bitrate = Math.round((bytesDiff * 8) / timeDiff / 1000) // kbps
            }
            
            lastStatsRef.current.time = now
            lastStatsRef.current.bytes = currentBytes
          }

          // Get FPS
          if (report.framesPerSecond !== undefined) {
            fps = Math.round(report.framesPerSecond)
          } else if (report.framesSent !== undefined) {
            // Alternative FPS calculation
            const now = Date.now()
            const currentFrames = report.framesSent
            
            if (lastStatsRef.current.frameTime && lastStatsRef.current.frameCount !== undefined) {
              const timeDiff = (now - lastStatsRef.current.frameTime) / 1000
              const framesDiff = currentFrames - lastStatsRef.current.frameCount
              
              if (timeDiff > 0) {
                fps = Math.round(framesDiff / timeDiff)
              }
            }
            
            lastStatsRef.current.frameTime = now
            lastStatsRef.current.frameCount = currentFrames
          }

          // Get resolution from video track
          if (report.frameWidth && report.frameHeight) {
            resolution = `${report.frameWidth}x${report.frameHeight}`
          }
        }

        // Get candidate pair stats for latency
        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          if (report.currentRoundTripTime !== undefined) {
            latency = Math.round(report.currentRoundTripTime * 1000) // convert to ms
          }
        }
      })

      // Get resolution from video element if not available from stats
      if (!resolution && videoRef.current) {
        const video = videoRef.current
        if (video.videoWidth && video.videoHeight) {
          resolution = `${video.videoWidth}x${video.videoHeight}`
        }
      }

      // Also try to get resolution from the local stream
      if (!resolution && localStream) {
        const videoTrack = localStream.getVideoTracks()[0]
        if (videoTrack) {
          const settings = videoTrack.getSettings()
          if (settings.width && settings.height) {
            resolution = `${settings.width}x${settings.height}`
          }
        }
      }

      const newStats = {
        bitrate,
        fps,
        resolution,
        latency,
        streamId: currentStreamId
      }

      setStreamStats(newStats)

    } catch (error) {
      console.error('Error collecting publisher stats:', error)
    }
  }

  // Function to generate keyframes on video track
  const generateKeyframe = async (pc: RTCPeerConnection) => {
    try {
      const senders = pc.getSenders()
      for (const sender of senders) {
        if (sender.track && sender.track.kind === 'video') {
          // Generate a keyframe by requesting an immediate keyframe
          if (sender.track.getSettings) {
            const settings = sender.track.getSettings()
            console.log('Generating keyframe for video track:', settings)
          }
          
          // Use generateKeyFrame if available (newer browsers)
          if ((sender as any).generateKeyFrame) {
            await (sender as any).generateKeyFrame()
            console.log('Keyframe generated successfully')
          } else {
            // Fallback: try to force keyframe through setParameters
            const params = sender.getParameters()
            if (params.encodings && params.encodings.length > 0) {
              // Force a parameter update which can trigger keyframe generation
              params.encodings[0].maxBitrate = params.encodings[0].maxBitrate || 2000000
              await sender.setParameters(params)
              console.log('Keyframe generation attempted via parameter update')
            }
          }
        }
      }
    } catch (error) {
      console.error('Error generating keyframe:', error)
    }
  }

  // Function to copy text to clipboard
  const copyToClipboard = async (text: string, type: string) => {
    try {
      await navigator.clipboard.writeText(text)
      console.log(`${type} copied to clipboard`)
      // You could add a toast notification here
    } catch (error) {
      console.error(`Failed to copy ${type}:`, error)
      // Fallback for older browsers
      const textArea = document.createElement('textarea')
      textArea.value = text
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
    }
  }

  return (
    <div className="space-y-6">
      {/* Video Preview */}
      <div className="bg-black/40 backdrop-blur-sm rounded-xl overflow-hidden border border-white/10">
        <div className="aspect-video bg-gray-900 relative">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-cover"
          />
          {!localStream && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <Video className="w-16 h-16 text-gray-500 mx-auto mb-4" />
                <p className="text-gray-400">Camera preview will appear here</p>
              </div>
            </div>
          )}
          
          {/* Stream Status Overlay */}
          {isStreaming && (
            <div className="absolute top-4 left-4">
              <div className="flex items-center space-x-2 bg-red-600 text-white px-3 py-1 rounded-full text-sm font-medium">
                <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                <span>LIVE</span>
              </div>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <button
                onClick={toggleVideo}
                className={`p-3 rounded-lg transition-colors ${
                  videoEnabled
                    ? 'bg-emerald-700 hover:bg-emerald-600 text-white'
                    : 'bg-red-600 hover:bg-red-700 text-white'
                }`}
              >
                {videoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
              </button>
              <button
                onClick={toggleAudio}
                className={`p-3 rounded-lg transition-colors ${
                  audioEnabled
                    ? 'bg-emerald-700 hover:bg-emerald-600 text-white'
                    : 'bg-red-600 hover:bg-red-700 text-white'
                }`}
              >
                {audioEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
              </button>
            </div>

            <button
              onClick={isStreaming ? stopStream : startStream}
              disabled={!whipUrl && !isStreaming}
              className={`flex items-center space-x-2 px-6 py-3 rounded-lg font-medium transition-colors ${
                isStreaming
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white disabled:bg-gray-600 disabled:cursor-not-allowed'
              }`}
            >
              {isStreaming ? (
                <>
                  <Square className="w-5 h-5" />
                  <span>Stop Stream</span>
                </>
              ) : (
                <>
                  <Play className="w-5 h-5" />
                  <span>Start Stream</span>
                </>
              )}
            </button>
          </div>

          {/* WHIP URL Input */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                WHIP Endpoint URL
              </label>
              <div className="relative">
                <input
                  type="url"
                  value={whipUrl}
                  onChange={(e) => setWhipUrl(e.target.value)}
                  placeholder="http://localhost:8088/gateway/process/request/stream/start"
                  className="w-full px-4 py-3 bg-black/20 border border-white/10 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  disabled={isStreaming}
                />
                <Upload className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              </div>
            </div>

            {/* FPS Limit Slider */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Frame Rate Limit: {fpsLimit} FPS
              </label>
              <input
                type="range"
                min="10"
                max="60"
                step="5"
                value={fpsLimit}
                onChange={(e) => setFpsLimit(parseInt(e.target.value))}
                className="w-full h-2 bg-black/20 rounded-lg appearance-none cursor-pointer slider"
                disabled={isStreaming}
              />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>10 FPS</span>
                <span>60 FPS</span>
              </div>
            </div>

            {/* SDP Copy Buttons */}
            {(latestOffer || latestAnswer) && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Copy SDP Data
                </label>
                <div className="flex space-x-2">
                  {latestOffer && (
                    <button
                      onClick={() => copyToClipboard(latestOffer, 'Offer SDP')}
                      className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors"
                    >
                      Copy Offer
                    </button>
                  )}
                  {latestAnswer && (
                    <button
                      onClick={() => copyToClipboard(latestAnswer, 'Answer SDP')}
                      className="flex-1 px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg transition-colors"
                    >
                      Copy Answer
                    </button>
                  )}
                </div>
              </div>
            )}

            {!whipUrl && (
              <div className="flex items-center space-x-2 text-amber-400 text-sm">
                <AlertCircle className="w-4 h-4" />
                <span>Enter a WHIP endpoint URL to start streaming</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default StreamControls
