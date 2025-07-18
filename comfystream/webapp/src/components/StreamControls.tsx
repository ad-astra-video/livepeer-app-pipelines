import React, { useState, useRef, useEffect } from 'react'
import { Video, Mic, MicOff, VideoOff, Play, Square, Upload, AlertCircle, Download, X, Wifi, WifiOff, RefreshCw, Camera, Monitor } from 'lucide-react'
import { getDefaultWhipUrl } from '../utils/urls'
import { ConnectionResilient, DEFAULT_RESILIENCE_CONFIG } from '../utils/resilience'
import { 
  constructWhipUrl, 
  sendWhipOffer, 
  stopStream as stopStreamApi,
  sendStreamUpdate,
  StreamUpdateData
} from '../api'

interface MediaDevice {
  deviceId: string
  label: string
  kind: MediaDeviceKind
}

interface StreamControlsProps {
  isStreaming: boolean
  setIsStreaming: (streaming: boolean) => void
  setConnectionStatus: (status: 'disconnected' | 'connecting' | 'connected' | 'error') => void
  setStreamStats: (stats: any) => void
  setStreamId: (streamId: string | null) => void
  setStreamName: (streamName: string | null) => void
  setPlaybackUrl: (playbackUrl: string | null) => void
}

const StreamControls: React.FC<StreamControlsProps> = ({
  isStreaming,
  setIsStreaming,
  setConnectionStatus,
  setStreamStats,
  setStreamId,
  setStreamName: setParentStreamName,
  setPlaybackUrl
}) => {
  const [whipUrl, setWhipUrl] = useState(getDefaultWhipUrl())
  const [streamName, setLocalStreamName] = useState(() => `stream-${Math.random().toString(36).substring(2, 8)}`)
  
  // Wrapper function to update both local and parent state
  const setStreamName = (name: string) => {
    setLocalStreamName(name)
    setParentStreamName(name)
  }

  // Initialize parent stream name on mount
  useEffect(() => {
    setParentStreamName(streamName)
  }, [])
  const [pipeline, setPipeline] = useState('comfystream')
  const [prompt1, setPrompt1] = useState('')
  const [prompt2, setPrompt2] = useState('')
  const [prompt3, setPrompt3] = useState('')
  const [videoEnabled, setVideoEnabled] = useState(true)
  const [audioEnabled, setAudioEnabled] = useState(true)
  const [fpsLimit, setFpsLimit] = useState(30)
  const [resolution, setResolution] = useState('1280x720')
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [peerConnection, setPeerConnection] = useState<RTCPeerConnection | null>(null)
  const [currentStreamId, setCurrentStreamId] = useState<string | null>(null)
  const [latestOffer, setLatestOffer] = useState<string>('')
  const [latestAnswer, setLatestAnswer] = useState<string>('')
  const [resilience, setResilience] = useState<ConnectionResilient | null>(null)
  const [qualityIssues, setQualityIssues] = useState<string[]>([])
  const [isRecovering, setIsRecovering] = useState(false)
  const [reconnectAttempts, setReconnectAttempts] = useState(0)
  const [publisherStats, setPublisherStats] = useState({
    bitrate: 0,
    fps: 0,
    resolution: '',
    streamId: null as string | null
  })
  const videoRef = useRef<HTMLVideoElement>(null)
  const [sdpModalOpen, setSdpModalOpen] = useState(false)
  const [sdpModalContent, setSdpModalContent] = useState<{type: 'offer' | 'answer', content: string} | null>(null)
  
  // Media device selection states
  const [showMediaModal, setShowMediaModal] = useState(false)
  const [cameras, setCameras] = useState<MediaDevice[]>([])
  const [microphones, setMicrophones] = useState<MediaDevice[]>([])
  const [selectedCamera, setSelectedCamera] = useState<string>('')
  const [selectedMicrophone, setSelectedMicrophone] = useState<string>('')
  const [useScreenShare, setUseScreenShare] = useState(false)
  
  const statsIntervalRef = useRef<number | null>(null)
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
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop())
      }
      if (peerConnection) {
        peerConnection.close()
      }
    }
  }, [localStream, peerConnection, resilience])

  // Load media devices on component mount
  useEffect(() => {
    loadMediaDevices()
  }, [])

  const loadMediaDevices = async () => {
    try {
      // Request permission to access media devices
      await navigator.mediaDevices.getUserMedia({ audio: true, video: true })
      
      const devices = await navigator.mediaDevices.enumerateDevices()
      
      const videoDevices = devices
        .filter(device => device.kind === 'videoinput')
        .map(device => ({
          deviceId: device.deviceId,
          label: device.label || `Camera ${device.deviceId.slice(0, 8)}`,
          kind: device.kind
        }))
      
      const audioDevices = devices
        .filter(device => device.kind === 'audioinput')
        .map(device => ({
          deviceId: device.deviceId,
          label: device.label || `Microphone ${device.deviceId.slice(0, 8)}`,
          kind: device.kind
        }))
      
      setCameras(videoDevices)
      setMicrophones(audioDevices)
      
      // Set default selections
      if (videoDevices.length > 0 && !selectedCamera) {
        setSelectedCamera(videoDevices[0].deviceId)
      }
      if (audioDevices.length > 0 && !selectedMicrophone) {
        setSelectedMicrophone(audioDevices[0].deviceId)
      }
      
      console.log('Media devices loaded:', { videoDevices, audioDevices })
    } catch (error) {
      console.error('Error loading media devices:', error)
    }
  }

  const refreshMediaDevices = () => {
    loadMediaDevices()
  }

  const handleScreenShare = () => {
    setUseScreenShare(!useScreenShare)
    if (!useScreenShare) {
      // When enabling screen share, we might want to also update the selected camera
      console.log('Screen sharing enabled')
    }
  }

  const handleStartStreamClick = () => {
    if (!whipUrl) {
      alert('Please enter a WHIP URL')
      return
    }
    
    // Start streaming directly without modal
    startStream()
  }

  const handleStreamWithDevices = () => {
    setShowMediaModal(false)
    startStream()
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
      
      // Get user media with selected devices
      const [width, height] = resolution.split('x').map(Number)
      let currentStream: MediaStream
      
      if (videoEnabled) {
        if (useScreenShare) {
          // For screen share, we'll handle it separately
          const displayStream = await navigator.mediaDevices.getDisplayMedia({
            video: {
              width: { ideal: width },
              height: { ideal: height },
              frameRate: { ideal: fpsLimit, max: fpsLimit }
            }
          })
          
          // If audio is enabled, get audio separately and combine
          if (audioEnabled && selectedMicrophone) {
            const audioStream = await navigator.mediaDevices.getUserMedia({
              audio: { deviceId: selectedMicrophone }
            })
            
            // Combine streams
            currentStream = new MediaStream([
              ...displayStream.getVideoTracks(),
              ...audioStream.getAudioTracks()
            ])
          } else {
            currentStream = displayStream
          }
        } else {
          // Regular camera
          const videoConstraints = {
            deviceId: selectedCamera ? { exact: selectedCamera } : undefined,
            width: { ideal: width },
            height: { ideal: height },
            frameRate: { ideal: fpsLimit, max: fpsLimit }
          }
          
          currentStream = await navigator.mediaDevices.getUserMedia({
            video: videoConstraints,
            audio: audioEnabled ? (selectedMicrophone ? { deviceId: selectedMicrophone } : true) : false
          })
        }
      } else {
        // Audio only
        currentStream = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: audioEnabled ? (selectedMicrophone ? { deviceId: selectedMicrophone } : true) : false
        })
      }
      
      setLocalStream(currentStream)
      if (videoRef.current) {
        videoRef.current.srcObject = currentStream
      }

      // Log the actual video track settings to verify resolution
      const videoTrack = currentStream.getVideoTracks()[0]
      if (videoTrack) {
        const settings = videoTrack.getSettings()
        console.log(`Video track settings: ${settings.width}x${settings.height} @ ${settings.frameRate}fps`)
        console.log(`Requested resolution: ${resolution}, actual resolution: ${settings.width}x${settings.height}`)
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
      currentStream.getTracks().forEach(track => {
        pc.addTrack(track, currentStream)
      })

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
      
      // Construct the WHIP URL with parameters
      const [resWidth, resHeight] = resolution.split('x').map(Number)
      const prompts = [prompt1, prompt2, prompt3].filter(p => p.trim() !== '')
      const constructedUrl = constructWhipUrl(whipUrl, streamName, pipeline, resWidth, resHeight, prompts)
      console.log(`Constructed WHIP URL: ${constructedUrl}`)
      
      // Send WHIP offer with retry logic
      const response = await sendWhipOffer(constructedUrl, currentSdp)

      if (response.status == 201) {
        const answerSdp = response.answerSdp
        const streamId = response.streamId
        const playbackUrl = response.playbackUrl
        const locationHeader = response.locationHeader
        
        console.log(`Stream ID: ${streamId}`)
        console.log(`Playback URL: ${playbackUrl}`)
        console.log(`Location Header: ${locationHeader}`)
        
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
        setPlaybackUrl(playbackUrl)
        
        // Configure resilience manager with ICE restart endpoint from Location header and stream ID
        if (resilienceManager && streamId && locationHeader) {
          // Use the Location header as the ICE restart endpoint
          resilienceManager.updateIceRestartConfig(locationHeader, streamId)
        }
        
        // Start collecting real-time stats
        statsIntervalRef.current = window.setInterval(() => {
          collectPublisherStats(pc)
        }, 1000) // Update stats every second
        
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
  
  const stopStream = async () => {
    try {
      // Send stop request to server if we have a stream ID
      if (currentStreamId) {
        await stopStreamApi({ streamId: currentStreamId, whipUrl })
      }
    } catch (error) {
      console.error('Error sending stop request:', error)
    }
    
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
    setPlaybackUrl(null)
    setLatestOffer('')
    setLatestAnswer('')
    setPublisherStats({
      bitrate: 0,
      fps: 0,
      resolution: '',
      streamId: null
    })
    setStreamStats({
      bitrate: 0,
      fps: 0,
      resolution: '',
      streamId: null
    })
  }
  
  // Update function to send prompts and resolution changes
  const sendUpdate = async () => {
    if (!isStreaming) {
      alert('No active stream to update')
      return
    }

    try {
      // Prepare prompts data
      const prompts = [prompt1, prompt2, prompt3].filter(p => p.trim() !== '')
      let promptsData
      
      if (prompts.length === 0) {
        promptsData = ""
      } else if (prompts.length === 1) {
        promptsData = prompts[0]
      } else {
        promptsData = prompts
      }

      // Get current resolution
      const [resWidth, resHeight] = resolution.split('x').map(Number)
      
      const updateData: StreamUpdateData = {
        height: resHeight,
        width: resWidth,
        prompts: promptsData
      }

      await sendStreamUpdate({
        whipUrl,
        streamName,
        updateData
      })
      
      // You could show a success message here
    } catch (error) {
      console.error('Error sending update:', error)
      alert('Failed to send update')
    }
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

  // Function to collect real-time stats focusing on incoming frame data
  const collectPublisherStats = async (pc: RTCPeerConnection) => {
    try {
      const stats = await pc.getStats()
      let bitrate = 0
      let fps = 0
      let resolution = ''

      // Log available report types for debugging
      const reportTypes = new Set()
      stats.forEach((report) => {
        reportTypes.add(report.type)
      })
      console.log('Available stats report types:', Array.from(reportTypes))

      stats.forEach((report) => {
        // Monitor media source stats (incoming frames from camera/media)
        if (report.type === 'media-source' && report.kind === 'video') {
          // Get FPS from media source
          if (report.framesPerSecond !== undefined) {
            fps = Math.round(report.framesPerSecond)
          }
          
          // Get resolution from media source
          if (report.width && report.height) {
            resolution = `${report.width}x${report.height}`
          }
        }
        
        // Monitor track stats for incoming media data
        if (report.type === 'track' && report.kind === 'video') {
          // Get frame stats from track
          if (report.frameWidth && report.frameHeight) {
            resolution = `${report.frameWidth}x${report.frameHeight}`
          }
          
          // Calculate FPS from frame count if available
          if (report.framesReceived !== undefined) {
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
        
        // Monitor inbound-rtp for any incoming data (if publisher receives feedback)
        if (report.type === 'inbound-rtp' && report.mediaType === 'video') {
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

          // Get FPS from received frames
          if (report.framesPerSecond !== undefined) {
            fps = Math.round(report.framesPerSecond)
          } else if (report.framesReceived !== undefined) {
            // Alternative FPS calculation from received frames
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

          // Get resolution from received video
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

      // Get resolution and FPS from the local stream (actual incoming capture data)
      if (!resolution && localStream) {
        const videoTrack = localStream.getVideoTracks()[0]
        if (videoTrack) {
          const settings = videoTrack.getSettings()
          if (settings.width && settings.height) {
            resolution = `${settings.width}x${settings.height}`
          }
          
          // Get actual capture frame rate
          if (!fps && settings.frameRate) {
            fps = Math.round(settings.frameRate)
          }
        }
      }
      
      // Calculate bitrate from track statistics if not available from WebRTC stats
      if (!bitrate && localStream) {
        const videoTrack = localStream.getVideoTracks()[0]
        if (videoTrack) {
          const settings = videoTrack.getSettings()
          // Estimate bitrate based on resolution and frame rate
          if (settings.width && settings.height && settings.frameRate) {
            // Very rough estimate: pixels * framerate * bits per pixel
            const pixelCount = settings.width * settings.height
            const estimatedBitrate = Math.round((pixelCount * settings.frameRate * 0.1) / 1000) // rough estimate in kbps
            bitrate = estimatedBitrate
          }
        }
      }

      const newStats = {
        bitrate,
        fps,
        resolution,
        streamId: currentStreamId
      }

      setPublisherStats(newStats)

    } catch (error) {
      console.error('Error collecting publisher stats:', error)
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
                onClick={isStreaming ? stopStream : handleStartStreamClick}
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

          {/* SDP Data Buttons - Moved here */}
          {(latestOffer || latestAnswer) && (
            <div className="mb-4">
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

          {/* Publisher Stats Display */}
          {isStreaming && (
            <div className="mb-4 p-3 bg-blue-900/30 border border-blue-500/30 rounded-lg">
              <div className="flex items-center space-x-2 mb-2">
                <Upload className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-medium text-blue-400">Publisher Stats</span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-gray-400">Bitrate:</span>
                  <span className="text-white ml-1">{publisherStats.bitrate} kbps</span>
                </div>
                <div>
                  <span className="text-gray-400">FPS:</span>
                  <span className="text-white ml-1">{publisherStats.fps}</span>
                </div>
                <div>
                  <span className="text-gray-400">Resolution:</span>
                  <span className="text-white ml-1">{publisherStats.resolution || 'Unknown'}</span>
                </div>
              </div>
              {publisherStats.streamId && (
                <div className="mt-2 text-xs">
                  <span className="text-gray-400">Stream ID:</span>
                  <span className="text-white ml-1 font-mono">{publisherStats.streamId}</span>
                </div>
              )}
            </div>
          )}

          {/* Stream Configuration Inputs */}
          <div className="space-y-4">
            {/* Media Device Selection */}
            <div className="p-4 bg-black/20 rounded-lg border border-white/10">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-white flex items-center">
                  <Camera className="w-4 h-4 mr-2" />
                  Media Sources
                </h3>
                <button
                  onClick={refreshMediaDevices}
                  className="text-gray-400 hover:text-white transition-colors"
                  title="Refresh devices"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Camera Selection */}
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-2">
                    Camera
                  </label>
                  <select
                    value={selectedCamera}
                    onChange={(e) => setSelectedCamera(e.target.value)}
                    className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    disabled={useScreenShare}
                  >
                    <option value="">Select Camera</option>
                    {cameras.map((camera) => (
                      <option key={camera.deviceId} value={camera.deviceId}>
                        {camera.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Microphone Selection */}
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-2">
                    Microphone
                  </label>
                  <select
                    value={selectedMicrophone}
                    onChange={(e) => setSelectedMicrophone(e.target.value)}
                    className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="">Select Microphone</option>
                    {microphones.map((mic) => (
                      <option key={mic.deviceId} value={mic.deviceId}>
                        {mic.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Screen Share Toggle */}
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-2">
                    Screen Share
                  </label>
                  <button
                    onClick={handleScreenShare}
                    className={`w-full flex items-center justify-center space-x-2 px-3 py-2 rounded text-sm font-medium transition-colors ${
                      useScreenShare
                        ? 'bg-green-600 hover:bg-green-700 text-white'
                        : 'bg-gray-600 hover:bg-gray-700 text-white'
                    }`}
                  >
                    <Monitor className="w-4 h-4" />
                    <span>{useScreenShare ? 'Screen Share ON' : 'Screen Share OFF'}</span>
                  </button>
                </div>
              </div>

              {/* Selected Source Info */}
              <div className="mt-3 text-xs text-gray-400">
                <span>Source: </span>
                {useScreenShare ? (
                  <span className="text-green-400">Screen Share</span>
                ) : selectedCamera ? (
                  <span className="text-blue-400">
                    {cameras.find(c => c.deviceId === selectedCamera)?.label || 'Camera'}
                  </span>
                ) : (
                  <span className="text-red-400">No video source selected</span>
                )}
                {selectedMicrophone && (
                  <>
                    <span> + </span>
                    <span className="text-purple-400">
                      {microphones.find(m => m.deviceId === selectedMicrophone)?.label || 'Microphone'}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* WHIP URL Input */}
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

            {/* Stream Name Input */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Stream Name
              </label>
              <input
                type="text"
                value={streamName}
                onChange={(e) => setStreamName(e.target.value)}
                placeholder="Auto-generated stream name"
                className="w-full px-4 py-3 bg-black/20 border border-white/10 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                disabled={isStreaming}
              />
            </div>

            {/* Pipeline Input */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Pipeline
              </label>
              <input
                type="text"
                value={pipeline}
                onChange={(e) => setPipeline(e.target.value)}
                placeholder="Default: noop"
                className="w-full px-4 py-3 bg-black/20 border border-white/10 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                disabled={isStreaming}
              />
            </div>

            {/* Prompts Input */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Prompts
              </label>
              <div className="space-y-2">
                <input
                  type="text"
                  value={prompt1}
                  onChange={(e) => setPrompt1(e.target.value)}
                  placeholder="Enter first prompt"
                  className="w-full px-4 py-2 bg-black/20 border border-white/10 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
                <input
                  type="text"
                  value={prompt2}
                  onChange={(e) => setPrompt2(e.target.value)}
                  placeholder="Enter second prompt (optional)"
                  className="w-full px-4 py-2 bg-black/20 border border-white/10 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
                <input
                  type="text"
                  value={prompt3}
                  onChange={(e) => setPrompt3(e.target.value)}
                  placeholder="Enter third prompt (optional)"
                  className="w-full px-4 py-2 bg-black/20 border border-white/10 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>
              <button
                onClick={sendUpdate}
                disabled={!isStreaming}
                className="mt-3 w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
              >
                Update
              </button>
              <p className="text-xs text-gray-400 mt-1">
                Enter prompts and click Update to send changes with current resolution
              </p>
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

            {/* Resolution Picker */}
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
                <option value="512x512">512x512 (SD)</option>
                <option value="640x480">640x480 (VGA)</option>
                <option value="854x480">854x480 (FWVGA)</option>
                <option value="1280x720">1280x720 (HD) - Default</option>
                <option value="1920x1080">1920x1080 (Full HD)</option>
                <option value="2560x1440">2560x1440 (QHD)</option>
                <option value="3840x2160">3840x2160 (4K UHD)</option>
              </select>
              <p className="text-xs text-gray-400 mt-1">
                {isStreaming ? 'Stop stream to change resolution' : 'Select video resolution before starting stream'}
              </p>
            </div>

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

      {/* Media Device Selection Modal */}
      {showMediaModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-white/10 rounded-xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white flex items-center">
                <Camera className="w-5 h-5 mr-2" />
                Select Media Sources
              </h3>
              <button
                onClick={() => setShowMediaModal(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Camera Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Camera
                </label>
                <select
                  value={selectedCamera}
                  onChange={(e) => setSelectedCamera(e.target.value)}
                  className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  disabled={useScreenShare}
                >
                  <option value="">Select Camera</option>
                  {cameras.map((camera) => (
                    <option key={camera.deviceId} value={camera.deviceId}>
                      {camera.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Microphone Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Microphone
                </label>
                <select
                  value={selectedMicrophone}
                  onChange={(e) => setSelectedMicrophone(e.target.value)}
                  className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="">Select Microphone</option>
                  {microphones.map((mic) => (
                    <option key={mic.deviceId} value={mic.deviceId}>
                      {mic.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Screen Share Toggle */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Screen Share
                </label>
                <button
                  onClick={() => setUseScreenShare(!useScreenShare)}
                  className={`w-full flex items-center justify-center space-x-2 px-3 py-2 rounded text-sm font-medium transition-colors ${
                    useScreenShare
                      ? 'bg-green-600 hover:bg-green-700 text-white'
                      : 'bg-gray-600 hover:bg-gray-700 text-white'
                  }`}
                >
                  <Monitor className="w-4 h-4" />
                  <span>{useScreenShare ? 'Screen Share ON' : 'Screen Share OFF'}</span>
                </button>
              </div>

              {/* Selected Source Info */}
              <div className="p-3 bg-black/30 rounded-lg">
                <p className="text-xs text-gray-400 mb-1">Selected sources:</p>
                <div className="text-sm">
                  <div className="text-white">
                    📹 {useScreenShare ? (
                      <span className="text-green-400">Screen Share</span>
                    ) : selectedCamera ? (
                      <span className="text-blue-400">
                        {cameras.find(c => c.deviceId === selectedCamera)?.label || 'Camera'}
                      </span>
                    ) : (
                      <span className="text-red-400">No video source</span>
                    )}
                  </div>
                  {selectedMicrophone && (
                    <div className="text-white">
                      🎤 <span className="text-purple-400">
                        {microphones.find(m => m.deviceId === selectedMicrophone)?.label || 'Microphone'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex space-x-3 mt-6">
              <button
                onClick={() => setShowMediaModal(false)}
                className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleStreamWithDevices}
                disabled={!useScreenShare && !selectedCamera}
                className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed"
              >
                Start Stream
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default StreamControls
