import React, { useState, useRef, useEffect } from 'react'
import { Play, Square, Monitor, AlertCircle, Download, X, Wifi, WifiOff, RefreshCw } from 'lucide-react'
import { getDefaultWhepUrl } from '../utils/urls'
import { ConnectionResilient, DEFAULT_RESILIENCE_CONFIG } from '../utils/resilience'
import { constructWhepUrl, sendWhepOffer } from '../api'

interface ViewerControlsProps {
  isViewing: boolean
  setIsViewing: (viewing: boolean) => void
  setConnectionStatus: (status: 'disconnected' | 'connecting' | 'connected' | 'error') => void
  setStreamStats: (stats: any) => void
  playbackUrl: string | null
}

const ViewerControls: React.FC<ViewerControlsProps> = ({
  isViewing,
  setIsViewing,
  setConnectionStatus,
  setStreamStats,
  playbackUrl
}) => {
  const [whepUrl, setWhepUrl] = useState(getDefaultWhepUrl())
  const [latestOffer, setLatestOffer] = useState<string>('')
  const [latestAnswer, setLatestAnswer] = useState<string>('')
  const [peerConnection, setPeerConnection] = useState<RTCPeerConnection | null>(null)
  const [sdpModalOpen, setSdpModalOpen] = useState(false)
  const [sdpModalContent, setSdpModalContent] = useState<{type: 'offer' | 'answer', content: string} | null>(null)
  const [resilience, setResilience] = useState<ConnectionResilient | null>(null)
  const [qualityIssues, setQualityIssues] = useState<string[]>([])
  const [isRecovering, setIsRecovering] = useState(false)
  const [reconnectAttempts, setReconnectAttempts] = useState(0)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [currentStats, setCurrentStats] = useState({
    bitrate: 0,
    fps: 0,
    resolution: ''
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
      if (resilience) {
        resilience.cleanup()
      }
      if (peerConnection) {
        peerConnection.close()
      }
    }
  }, [peerConnection, resilience])

  const startViewing = async () => {
    if (!whepUrl) {
      alert('Please enter a WHEP URL')
      return
    }

    if (!playbackUrl) {
      alert('No playback URL available. Please start publishing first.')
      return
    }

    if (!playbackUrl) {
      alert('No playback URL available. Please start publishing first.')
      return
    }

    try {
      setConnectionStatus('connecting')
      
      // Create resilience manager
      const resilienceManager = new ConnectionResilient({
        ...DEFAULT_RESILIENCE_CONFIG,
        connectionType: 'whep',
        qualityThresholds: {
          minBitrate: 50, // Lower threshold for viewer
          maxLatency: 1000,
          maxPacketLoss: 10
        }
      })
      
      resilienceManager.setCallbacks({
        onReconnecting: () => {
          console.log('Viewer connection recovering...')
          setIsRecovering(true)
          setConnectionStatus('connecting')
        },
        onReconnected: () => {
          console.log('Viewer connection recovered!')
          setIsRecovering(false)
          setReconnectAttempts(0)
          setConnectionStatus('connected')
        },
        onReconnectFailed: () => {
          console.error('Viewer reconnection failed permanently')
          setIsRecovering(false)
          setConnectionStatus('error')
          stopViewing()
        },
        onQualityIssue: (issue) => {
          console.warn(`Viewer quality issue: ${issue}`)
          setQualityIssues(prev => [...prev.filter(i => i !== issue), issue])
        },
        onQualityRecovered: () => {
          console.log('Viewer quality recovered')
          setQualityIssues([])
        }
      })
      
      setResilience(resilienceManager)
      
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

      // Handle incoming stream
      pc.ontrack = (event) => {
        if (videoRef.current) {
          videoRef.current.srcObject = event.streams[0]
        }
      }

      // Enhanced connection state monitoring
      pc.addEventListener('connectionstatechange', () => {
        console.log(`Viewer connection state: ${pc.connectionState}`)
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
      
      console.log(`Gathered ${iceCandidates.length} ICE candidates, sending WHEP offer`);
      
      // Get the current SDP with all gathered candidates
      const currentSdp = pc.localDescription?.sdp;
      if (!currentSdp) {
        throw new Error('No local description available');
      }
      
      // Log SDP length to verify it contains candidates
      console.log(`Original offer SDP length: ${offer.sdp.length}`);
      console.log(`Updated SDP length with candidates: ${currentSdp.length}`);

      // Send WHEP offer with retry logic
      // Extract the path from the playback URL and append it to the WHEP endpoint
      const whepEndpoint = constructWhepUrl(whepUrl, playbackUrl)
      console.log(`Constructed WHEP URL: ${whepEndpoint}`)
      const response = await sendWhepOffer(whepEndpoint, currentSdp)

      if (response.status === 200 || response.status === 201) {
        const answerSdp = response.answerSdp
        const locationHeader = response.locationHeader
        
        console.log(`WHEP Location Header: ${locationHeader}`)
        
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
        
        // Configure resilience manager with ICE restart endpoint from Location header
        if (resilienceManager && playbackUrl) {
          if (locationHeader) {
            // Use the Location header as the ICE restart endpoint
            // Extract stream ID from playback URL for identification
            const streamIdMatch = playbackUrl.match(/\/([^\/]+)\/whep$/)
            const extractedStreamId = streamIdMatch ? streamIdMatch[1] : 'viewer-session'
            resilienceManager.updateIceRestartConfig(locationHeader, extractedStreamId)
          } else {
            // Fallback to using the WHEP endpoint base URL for ICE restart
            const iceRestartEndpoint = getDefaultWhepUrl()
            const streamIdMatch = playbackUrl.match(/\/([^\/]+)\/whep$/)
            const extractedStreamId = streamIdMatch ? streamIdMatch[1] : 'viewer-session'
            resilienceManager.updateIceRestartConfig(iceRestartEndpoint, extractedStreamId)
          }
        }
        
        // Start collecting real-time stats
        statsIntervalRef.current = window.setInterval(() => {
          collectViewerStats(pc)
        }, 1000) // Update stats every second
        
        // Initial stats update
        setTimeout(() => collectViewerStats(pc), 1000)
      } else {
        throw new Error(`Failed to send WHEP offer: ${response.status}`)
      }

    } catch (error) {
      console.error('Error starting viewer:', error)
      setConnectionStatus('error')
      if (resilience) {
        resilience.cleanup()
        setResilience(null)
      }
    }
  }

  const stopViewing = () => {
    // Clear stats collection interval
    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current)
      statsIntervalRef.current = null
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
      resolution: ''
    })
    setStreamStats({
      bitrate: 0,
      fps: 0,
      resolution: '',
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

      stats.forEach((report) => {
        if (report.type === 'inbound-rtp' && report.mediaType === 'video') {
          // Check for first frame received (for logging purposes only)
          if (!firstFrameReceivedRef.current && report.framesReceived && report.framesReceived > 0 && answerReceivedTimeRef.current) {
            const startupTime = Date.now() - answerReceivedTimeRef.current
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
        streamId: null
      }

      setCurrentStats({ bitrate, fps, resolution })
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

  // Function to show SDP in modal
  const showSdpModal = (type: 'offer' | 'answer', content: string) => {
    setSdpModalContent({ type, content })
    setSdpModalOpen(true)
  }

  // Manual recovery functions
  const forceReconnect = async () => {
    console.log('Forcing viewer reconnection...')
    setReconnectAttempts(prev => prev + 1)
    
    if (isViewing) {
      stopViewing()
      // Wait a moment before reconnecting
      setTimeout(() => {
        startViewing()
      }, 1000)
    }
  }

  const forceIceRestart = () => {
    if (peerConnection && resilience) {
      console.log('Forcing ICE restart for viewer...')
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
                  {sdpModalContent?.type === 'offer' ? 'Viewer Offer SDP' : 'Viewer Answer SDP'}
                </h2>
                <p className="text-sm text-gray-400 mt-1">
                  {sdpModalContent?.type === 'offer' ? 'WebRTC Offer from Viewer' : 'WebRTC Answer to Viewer'}
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
                {playbackUrl && (
                  <p className="text-sm text-emerald-400 mt-2">Playback URL available: {playbackUrl.substring(0, 30)}...</p>
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
              
              {/* Resilience Status Indicators */}
              {isViewing && (
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
              {isViewing && (
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

          {/* Viewer Stats Display */}
          {isViewing && (
            <div className="mb-4 p-3 bg-emerald-900/30 border border-emerald-500/30 rounded-lg">
              <div className="flex items-center space-x-2 mb-2">
                <Monitor className="w-4 h-4 text-emerald-400" />
                <span className="text-sm font-medium text-emerald-400">Viewer Stats</span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-gray-400">Bitrate:</span>
                  <span className="text-white ml-1">{currentStats.bitrate} kbps</span>
                </div>
                <div>
                  <span className="text-gray-400">FPS:</span>
                  <span className="text-white ml-1">{currentStats.fps}</span>
                </div>
                <div>
                  <span className="text-gray-400">Resolution:</span>
                  <span className="text-white ml-1">{currentStats.resolution || 'Unknown'}</span>
                </div>
              </div>
              {playbackUrl && (
                <div className="mt-2 text-xs">
                  <span className="text-gray-400">Playback URL:</span>
                  <span className="text-white ml-1 font-mono">{playbackUrl}</span>
                </div>
              )}
            </div>
          )}

          {/* WHEP URL Input */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                WHEP Endpoint Base URL
              </label>
              <p className="text-xs text-gray-400 mb-2">
                The playback URL path from the WHIP response will be appended to this base URL
              </p>
              <div className="relative">
                <input
                  type="url"
                  value={whepUrl}
                  onChange={(e) => setWhepUrl(e.target.value)}
                  placeholder={getDefaultWhepUrl()}
                  className="w-full px-4 py-3 bg-black/20 border border-white/10 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  disabled={isViewing}
                />
                <Download className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              </div>
              
              {/* Show constructed WHEP URL preview */}
              {playbackUrl && whepUrl && (
                <div className="mt-2 p-2 bg-emerald-900/20 border border-emerald-500/30 rounded-lg">
                  <div className="text-xs text-emerald-400 font-medium mb-1">Final WHEP URL:</div>
                  <div className="text-xs text-gray-300 font-mono break-all">
                    {constructWhepUrl(whepUrl, playbackUrl)}
                  </div>
                </div>
              )}
            </div>

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
    </>
  )
}

export default ViewerControls
