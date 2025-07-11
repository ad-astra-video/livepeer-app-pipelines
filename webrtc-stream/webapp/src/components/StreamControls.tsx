import React, { useState, useRef, useEffect } from 'react'
import { Video, Mic, MicOff, VideoOff, Play, Square, Upload, AlertCircle, Download, X, Wifi, WifiOff, RefreshCw } from 'lucide-react'
import { getDefaultWhipUrl, getIceRestartEndpointBase } from '../utils/urls'
import { ConnectionResilient, DEFAULT_RESILIENCE_CONFIG } from '../utils/resilience'

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
  const [whipUrl, setWhipUrl] = useState(getDefaultWhipUrl())
  const [videoEnabled, setVideoEnabled] = useState(true)
  const [audioEnabled, setAudioEnabled] = useState(true)
  const [fpsLimit, setFpsLimit] = useState(30)
  const [resolution, setResolution] = useState('720p') // Add resolution control
  const [maxBitrate, setMaxBitrate] = useState(2000) // Add bitrate control (kbps)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [peerConnection, setPeerConnection] = useState<RTCPeerConnection | null>(null)
  const [currentStreamId, setCurrentStreamId] = useState<string | null>(null)
  const [latestOffer, setLatestOffer] = useState<string>('')
  const [latestAnswer, setLatestAnswer] = useState<string>('')
  const [resilience, setResilience] = useState<ConnectionResilient | null>(null)
  const [qualityIssues, setQualityIssues] = useState<string[]>([])
  const [isRecovering, setIsRecovering] = useState(false)
  const [reconnectAttempts, setReconnectAttempts] = useState(0)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [sdpModalOpen, setSdpModalOpen] = useState(false)
  const [sdpModalContent, setSdpModalContent] = useState<{type: 'offer' | 'answer', content: string} | null>(null)
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
      if (resilience) {
        resilience.cleanup()
      }
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop())
      }
      if (peerConnection) {
        peerConnection.close()
      }
    }
  }, [localStream, peerConnection, resilience])

  // Helper function to get resolution constraints
  const getResolutionConstraints = (resolution: string) => {
    switch (resolution) {
      case '720p':
        return { width: { exact: 1280 }, height: { exact: 720 } }
      case '1080p':
        return { width: { exact: 1920 }, height: { exact: 1080 } }
      case '4k':
        return { width: { exact: 3840 }, height: { exact: 2160 } }
      default:
        return { width: { exact: 1280 }, height: { exact: 720 } }
    }
  }

  const startStream = async () => {
    if (!whipUrl) {
      alert('Please enter a WHIP URL')
      return
    }

    try {
      setConnectionStatus('connecting')
      
      // Create resilience manager
      const resilienceManager = new ConnectionResilient({
        ...DEFAULT_RESILIENCE_CONFIG,
        connectionType: 'whip',
        qualityThresholds: {
          minBitrate: 200, // Higher threshold for publisher
          maxLatency: 300,
          maxPacketLoss: 3
        }
      })
      
      resilienceManager.setCallbacks({
        onReconnecting: () => {
          console.log('Publisher connection recovering...')
          setIsRecovering(true)
          setConnectionStatus('connecting')
        },
        onReconnected: () => {
          console.log('Publisher connection recovered!')
          setIsRecovering(false)
          setReconnectAttempts(0)
          setConnectionStatus('connected')
        },
        onReconnectFailed: () => {
          console.error('Publisher reconnection failed permanently')
          setIsRecovering(false)
          setConnectionStatus('error')
          stopStream()
        },
        onQualityIssue: (issue) => {
          console.warn(`Publisher quality issue: ${issue}`)
          setQualityIssues(prev => [...prev.filter(i => i !== issue), issue])
        },
        onQualityRecovered: () => {
          console.log('Publisher quality recovered')
          setQualityIssues([])
        }
      })
      
      setResilience(resilienceManager)
      
      // Get user media
      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoEnabled ? {
          ...getResolutionConstraints(resolution),
          frameRate: { exact: fpsLimit }
        } : false,
        audio: audioEnabled
      })
      
      setLocalStream(stream)
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }

      // Create peer connection with enhanced configuration
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ],
        iceTransportPolicy: 'all',
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require'
      })

      setPeerConnection(pc)

      // Set up resilience monitoring
      resilienceManager.monitorConnection(pc)

      // Enhanced connection state monitoring
      pc.addEventListener('connectionstatechange', () => {
        console.log(`Publisher connection state: ${pc.connectionState}`)
        if (pc.connectionState === 'connected') {
          setConnectionStatus('connected')
          setIsRecovering(false)
        } else if (pc.connectionState === 'failed') {
          setConnectionStatus('error')
        }
      })

      // Monitor ICE gathering state
      pc.addEventListener('icegatheringstatechange', () => {
        console.log(`ICE gathering state: ${pc.iceGatheringState}`)
      })

      // Add tracks to peer connection
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream)
      })

      // Configure encoder parameters to lock resolution and disable adaptive bitrate
      const senders = pc.getSenders()
      for (const sender of senders) {
        if (sender.track && sender.track.kind === 'video') {
          const params = sender.getParameters()
          
          // Set encoding parameters to lock resolution
          if (!params.encodings || params.encodings.length === 0) {
            params.encodings = [{}]
          }
          
          // Lock the resolution and disable adaptive bitrate
          const resolutionConstraints = getResolutionConstraints(resolution)
          params.encodings[0] = {
            ...params.encodings[0],
            maxBitrate: maxBitrate * 1000, // Convert kbps to bps
            scaleResolutionDownBy: 1, // Don't scale down resolution
            active: true
          }
          
          await sender.setParameters(params)
          console.log('Video encoder parameters configured:', params)
        }
      }

      // Create offer
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      
      // Store the offer SDP
      setLatestOffer(offer.sdp)

      // Wait for ICE candidates with a timeout
      let iceCandidates: RTCIceCandidate[] = [];
      
      await new Promise<void>((resolve) => {
        // Set a timeout to avoid waiting forever - 3 seconds for better reliability
        const timeoutId = setTimeout(() => {
          console.log('ICE gathering timeout reached, continuing with available candidates');
          resolve();
        }, 3000);
        
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
      
      // Send WHIP offer with retry logic
      const response = await sendWhipOfferWithRetry(whipUrl, currentSdp)

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
        
        // Configure resilience manager with ICE restart endpoint and stream ID
        if (resilienceManager && streamId) {
          const iceRestartEndpoint = getIceRestartEndpointBase()
          resilienceManager.updateIceRestartConfig(iceRestartEndpoint, streamId)
        }
        
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
        throw new Error(`Failed to send WHIP offer: ${response.status}`)
      }

    } catch (error) {
      console.error('Error starting stream:', error)
      setConnectionStatus('error')
      if (resilience) {
        resilience.cleanup()
        setResilience(null)
      }
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop())
      }
    }
  }

  // Helper method for WHIP offer with retry logic
  const sendWhipOfferWithRetry = async (url: string, sdp: string, maxRetries = 3): Promise<Response> => {
    const livepeerHeader = btoa(JSON.stringify(
      { 
        "request": JSON.stringify({"start_stream": true}),
        "parameters": JSON.stringify({}),
        "capability": 'webrtc-stream',
        "timeout_seconds": 30
      }
    ))
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`WHIP offer attempt ${attempt}/${maxRetries}`)
        
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/sdp',
            'Livepeer': livepeerHeader
          },
          body: sdp
        })

        if (response.status === 201) {
          return response
        }

        if (attempt === maxRetries) {
          throw new Error(`All ${maxRetries} attempts failed. Last status: ${response.status}`)
        }

        // Wait before retry with exponential backoff
        const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 5000)
        console.log(`Attempt ${attempt} failed (${response.status}), retrying in ${waitTime}ms...`)
        await new Promise(resolve => setTimeout(resolve, waitTime))
        
      } catch (error) {
        if (attempt === maxRetries) {
          throw error
        }
        console.warn(`Attempt ${attempt} failed:`, error)
        const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 5000)
        await new Promise(resolve => setTimeout(resolve, waitTime))
      }
    }
    
    throw new Error('All retry attempts failed')
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
    
    // Clean up resilience manager
    if (resilience) {
      resilience.cleanup()
      setResilience(null)
    }
    
    // Reset resilience state
    setQualityIssues([])
    setIsRecovering(false)
    setReconnectAttempts(0)
    
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

  // Function to show SDP in modal
  const showSdpModal = (type: 'offer' | 'answer', content: string) => {
    setSdpModalContent({ type, content })
    setSdpModalOpen(true)
  }

  // Manual recovery functions
  const forceReconnect = async () => {
    console.log('Forcing publisher reconnection...')
    setReconnectAttempts(prev => prev + 1)
    
    if (isStreaming) {
      stopStream()
      // Wait a moment before reconnecting
      setTimeout(() => {
        startStream()
      }, 1000)
    }
  }

  const forceIceRestart = () => {
    if (peerConnection && resilience) {
      console.log('Forcing ICE restart for publisher...')
      resilience.forceIceRestart(peerConnection)
    }
  }

  return (
    <>
      {/* SDP Modal */}
      {sdpModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setSdpModalOpen(false)}
          />
          
          {/* Modal */}
          <div className="relative bg-slate-900 border border-white/10 rounded-xl w-[95vw] h-[90vh] max-w-7xl shadow-2xl flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-white/10 shrink-0">
              <div>
                <h2 className="text-2xl font-semibold text-white">
                  {sdpModalContent?.type === 'offer' ? 'Stream Offer SDP' : 'Stream Answer SDP'}
                </h2>
                <p className="text-sm text-gray-400 mt-1">
                  {sdpModalContent?.type === 'offer' ? 'WebRTC Offer from Stream' : 'WebRTC Answer to Stream'}
                </p>
              </div>
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => sdpModalContent && copyToClipboard(sdpModalContent.content, `${sdpModalContent.type} SDP`)}
                  className="flex items-center space-x-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm rounded-lg transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span>Copy</span>
                </button>
                <button
                  onClick={() => setSdpModalOpen(false)}
                  className="p-2 text-gray-400 hover:text-white transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-6">
              {sdpModalContent && (
                <div className="bg-black/40 rounded-lg border border-white/10 h-full flex flex-col">
                  <div className="p-4 border-b border-white/10 shrink-0">
                    <h3 className="text-lg font-medium text-white">SDP Content</h3>
                  </div>
                  <div className="flex-1 overflow-auto p-4">
                    <pre className="text-sm text-gray-300 whitespace-pre font-mono min-w-max">
                      {sdpModalContent.content}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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
              
              {/* Resilience Status Indicators */}
              {isStreaming && (
                <div className="flex items-center space-x-2">
                  {isRecovering && (
                    <div className="flex items-center space-x-1 text-amber-400">
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span className="text-xs">Recovering</span>
                    </div>
                  )}
                  
                  {qualityIssues.length > 0 && !isRecovering && (
                    <div className="flex items-center space-x-1 text-red-400">
                      <WifiOff className="w-4 h-4" />
                      <span className="text-xs">{qualityIssues.length} issue{qualityIssues.length > 1 ? 's' : ''}</span>
                    </div>
                  )}
                  
                  {qualityIssues.length === 0 && !isRecovering && (
                    <div className="flex items-center space-x-1 text-emerald-400">
                      <Wifi className="w-4 h-4" />
                      <span className="text-xs">Good</span>
                    </div>
                  )}
                  
                  {reconnectAttempts > 0 && (
                    <div className="text-xs text-gray-400">
                      Attempts: {reconnectAttempts}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center space-x-2">
              {/* Manual Recovery Controls */}
              {isStreaming && (
                <div className="flex items-center space-x-2">
                  <button
                    onClick={forceIceRestart}
                    disabled={!peerConnection}
                    className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white text-sm rounded-lg transition-colors"
                    title="Force ICE restart to recover connection"
                  >
                    ICE Restart
                  </button>
                  
                  <button
                    onClick={forceReconnect}
                    disabled={isRecovering}
                    className="px-3 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-600 text-white text-sm rounded-lg transition-colors"
                    title="Force full reconnection"
                  >
                    <RefreshCw className={`w-4 h-4 ${isRecovering ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              )}
              
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
          </div>

          {/* Quality Issues Display */}
          {qualityIssues.length > 0 && (
            <div className="mb-4 p-3 bg-red-900/30 border border-red-500/30 rounded-lg">
              <div className="flex items-center space-x-2 mb-2">
                <AlertCircle className="w-4 h-4 text-red-400" />
                <span className="text-sm font-medium text-red-400">Connection Quality Issues</span>
              </div>
              <ul className="text-xs text-red-300 space-y-1">
                {qualityIssues.map((issue, index) => (
                  <li key={index}>• {issue}</li>
                ))}
              </ul>
              <p className="text-xs text-gray-400 mt-2">
                Automatic recovery is active. Use manual controls if issues persist.
              </p>
            </div>
          )}

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
                  placeholder={getDefaultWhipUrl()}
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

            {/* Max Bitrate Slider */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Max Bitrate: {maxBitrate} kbps
              </label>
              <input
                type="range"
                min="500"
                max="10000"
                step="100"
                value={maxBitrate}
                onChange={(e) => setMaxBitrate(parseInt(e.target.value))}
                className="w-full h-2 bg-black/20 rounded-lg appearance-none cursor-pointer slider"
                disabled={isStreaming}
              />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>500 kbps</span>
                <span>10 Mbps</span>
              </div>
            </div>

            {/* Resolution Selector */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Resolution: {resolution}
              </label>
              <select
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                className="w-full px-4 py-3 bg-black/20 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                disabled={isStreaming}
              >
                <option value="720p">720p (1280x720)</option>
                <option value="1080p">1080p (1920x1080)</option>
                <option value="4k">4K (3840x2160)</option>
              </select>
            </div>

            {/* SDP Copy Buttons */}
            {/* SDP Buttons */}
            {(latestOffer || latestAnswer) && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  View SDP Data
                </label>
                <div className="flex space-x-2">
                  {latestOffer && (
                    <button
                      onClick={() => showSdpModal('offer', latestOffer)}
                      className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors"
                    >
                      Offer
                    </button>
                  )}
                  {latestAnswer && (
                    <button
                      onClick={() => showSdpModal('answer', latestAnswer)}
                      className="flex-1 px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg transition-colors"
                    >
                      Answer
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
    </>
  )
}

export default StreamControls
