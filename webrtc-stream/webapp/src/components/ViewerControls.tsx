import React, { useState, useRef, useEffect } from 'react'
import { Play, Square, Monitor, AlertCircle, Download } from 'lucide-react'

interface ViewerControlsProps {
  isViewing: boolean
  setIsViewing: (viewing: boolean) => void
  setConnectionStatus: (status: 'disconnected' | 'connecting' | 'connected' | 'error') => void
  setStreamStats: (stats: any) => void
  streamId: string | null
}

const ViewerControls: React.FC<ViewerControlsProps> = ({
  isViewing,
  setIsViewing,
  setConnectionStatus,
  setStreamStats,
  streamId
}) => {
  const [whepUrl, setWhepUrl] = useState('http://localhost:8088/gateway/process/request/stream/play')
  const [inputStreamId, setInputStreamId] = useState('')
  const [latestOffer, setLatestOffer] = useState<string>('')
  const [latestAnswer, setLatestAnswer] = useState<string>('')
  const [peerConnection, setPeerConnection] = useState<RTCPeerConnection | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [currentStats, setCurrentStats] = useState({
    bitrate: 0,
    fps: 0,
    resolution: '',
    latency: 0,
    startupTime: 0
  })
  const statsIntervalRef = useRef<number | null>(null)
  const answerReceivedTimeRef = useRef<number | null>(null)
  const firstFrameReceivedRef = useRef<boolean>(false)
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
      if (peerConnection) {
        peerConnection.close()
      }
    }
  }, [peerConnection])
  
  // Update UI when streamId changes
  useEffect(() => {
    // Force rerender to update the UI with the new streamId
    if (streamId) {
      console.log(`Stream ID updated: ${streamId}`)
      // Auto-populate the input if it's empty
      if (!inputStreamId) {
        setInputStreamId(streamId)
      }
    }
  }, [streamId, inputStreamId])

  const startViewing = async () => {
    if (!whepUrl) {
      alert('Please enter a WHEP URL')
      return
    }

    try {
      setConnectionStatus('connecting')
      
      // Create peer connection
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' }
        ]
      })

      setPeerConnection(pc)

      // Handle incoming stream
      pc.ontrack = (event) => {
        if (videoRef.current) {
          videoRef.current.srcObject = event.streams[0]
        }
      }

      // Create offer for WHEP
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      })
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
      
      console.log(`Gathered ${iceCandidates.length} ICE candidates, sending WHEP offer`);
      
      // Get the current SDP with all gathered candidates
      const currentSdp = pc.localDescription?.sdp;
      if (!currentSdp) {
        throw new Error('No local description available');
      }
      
      // Log SDP length to verify it contains candidates
      console.log(`Original offer SDP length: ${offer.sdp.length}`);
      console.log(`Updated SDP length with candidates: ${currentSdp.length}`);
      // The updated SDP should be longer as it contains the ICE candidates

      // Send WHEP offer with all candidates included in the SDP
      const requestData: any = { 
        "request": JSON.stringify({"start_stream_output": true, "stream_id": inputStreamId || streamId || null}),
        "parameters": JSON.stringify({}),
        "capability": 'webrtc-stream',
        "timeout_seconds": 30
      }
      
      
      const livepeerHeader = btoa(JSON.stringify(requestData))
      const response = await fetch(whepUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/sdp',
          'Livepeer': livepeerHeader
        },
        body: currentSdp // Use the updated SDP with all gathered candidates
      })

      if (response.ok) {
        const answerSdp = await response.text()
        
        // Record when answer is received
        answerReceivedTimeRef.current = Date.now()
        firstFrameReceivedRef.current = false
        
        // Store the answer SDP
        setLatestAnswer(answerSdp)
        
        await pc.setRemoteDescription(new RTCSessionDescription({
          type: 'answer',
          sdp: answerSdp
        }))

        setIsViewing(true)
        setConnectionStatus('connected')
        
        // Start collecting real-time stats
        statsIntervalRef.current = window.setInterval(() => {
          collectViewerStats(pc)
        }, 1000) // Update stats every second
        
        // Initial stats update
        setTimeout(() => collectViewerStats(pc), 1000)
      } else {
        throw new Error('Failed to send WHEP offer')
      }

    } catch (error) {
      console.error('Error starting viewer:', error)
      setConnectionStatus('error')
    }
  }

  const stopViewing = () => {
    // Clear stats collection interval
    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current)
      statsIntervalRef.current = null
    }
    
    // Reset stats tracking
    lastStatsRef.current = {
      time: 0,
      bytes: 0,
      frameTime: 0,
      frameCount: 0
    }
    answerReceivedTimeRef.current = null
    firstFrameReceivedRef.current = false
    
    if (peerConnection) {
      peerConnection.close()
      setPeerConnection(null)
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null
    }

    setIsViewing(false)
    setConnectionStatus('disconnected')
    setLatestOffer('')
    setLatestAnswer('')
    setCurrentStats({
      bitrate: 0,
      fps: 0,
      resolution: '',
      latency: 0,
      startupTime: 0
    })
    setStreamStats({
      bitrate: 0,
      fps: 0,
      resolution: '',
      latency: 0,
      streamId: null
    })
  }

  // Function to collect real-time stats from the peer connection
  const collectViewerStats = async (pc: RTCPeerConnection) => {
    try {
      const stats = await pc.getStats()
      let bitrate = 0
      let fps = 0
      let resolution = ''
      let latency = 0
      let startupTime = currentStats.startupTime

      stats.forEach((report) => {
        if (report.type === 'inbound-rtp' && report.mediaType === 'video') {
          // Calculate startup time on first frame received
          if (!firstFrameReceivedRef.current && report.framesReceived && report.framesReceived > 0 && answerReceivedTimeRef.current) {
            startupTime = Date.now() - answerReceivedTimeRef.current
            firstFrameReceivedRef.current = true
            console.log(`First frame received! Startup time: ${startupTime}ms`)
          }

          // Calculate bitrate from bytes received
          if (report.bytesReceived !== undefined) {
            const now = Date.now()
            const currentBytes = report.bytesReceived
            
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
          } else if (report.framesReceived !== undefined) {
            // Alternative FPS calculation
            const now = Date.now()
            const currentFrames = report.framesReceived
            
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
        }

        // Get track stats for resolution
        if (report.type === 'track' && report.kind === 'video') {
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

      const newStats = {
        bitrate,
        fps,
        resolution,
        latency,
        startupTime,
        streamId: inputStreamId || streamId
      }

      setCurrentStats({ bitrate, fps, resolution, latency, startupTime })
      setStreamStats(newStats)

    } catch (error) {
      console.error('Error collecting viewer stats:', error)
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
      {/* Video Player */}
      <div className="bg-black/40 backdrop-blur-sm rounded-xl overflow-hidden border border-white/10">
        <div className="aspect-video bg-gray-900 relative">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            controls
            className="w-full h-full object-cover"
          />
          {!isViewing && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <Monitor className="w-16 h-16 text-gray-500 mx-auto mb-4" />
                <p className="text-gray-400">Stream will appear here</p>
                {streamId && (
                  <p className="text-sm text-emerald-400 mt-2">Stream ID available: {streamId.substring(0, 10)}...</p>
                )}
              </div>
            </div>
          )}
          
          {/* Viewing Status Overlay */}
          {isViewing && (
            <div className="absolute top-4 left-4">
              <div className="flex items-center space-x-2 bg-emerald-600 text-white px-3 py-1 rounded-full text-sm font-medium">
                <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                <span>VIEWING</span>
              </div>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <button className="p-3 bg-emerald-700 hover:bg-emerald-600 rounded-lg transition-colors text-white">
                <Monitor className="w-5 h-5" />
              </button>
            </div>

            <button
              onClick={isViewing ? stopViewing : startViewing}
              disabled={!whepUrl && !isViewing}
              className={`flex items-center space-x-2 px-6 py-3 rounded-lg font-medium transition-colors ${
                isViewing
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white disabled:bg-gray-600 disabled:cursor-not-allowed'
              }`}
            >
              {isViewing ? (
                <>
                  <Square className="w-5 h-5" />
                  <span>Stop Viewing</span>
                </>
              ) : (
                <>
                  <Play className="w-5 h-5" />
                  <span>Start Viewing</span>
                </>
              )}
            </button>
          </div>

          {/* WHEP URL Input */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                WHEP Endpoint URL
              </label>
              <div className="relative">
                <input
                  type="url"
                  value={whepUrl}
                  onChange={(e) => setWhepUrl(e.target.value)}
                  placeholder="http://localhost:8088/gateway/process/request/stream/play"
                  className="w-full px-4 py-3 bg-black/20 border border-white/10 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  disabled={isViewing}
                />
                <Download className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              </div>
            </div>

            {/* Stream ID Input */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Stream ID (Optional)
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={inputStreamId}
                  onChange={(e) => setInputStreamId(e.target.value)}
                  placeholder={streamId ? `Auto: ${streamId.substring(0, 20)}...` : "Enter specific stream ID"}
                  className="w-full px-4 py-3 bg-black/20 border border-white/10 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  disabled={isViewing}
                />
                <Monitor className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              </div>
              <p className="text-xs text-gray-400 mt-1">
                {inputStreamId ? 'Using custom stream ID' : streamId ? 'Will use auto-detected stream ID if left empty' : 'No stream ID available'}
              </p>
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

            {!whepUrl && (
              <div className="flex items-center space-x-2 text-amber-400 text-sm">
                <AlertCircle className="w-4 h-4" />
                <span>Enter a WHEP endpoint URL to start viewing</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default ViewerControls
