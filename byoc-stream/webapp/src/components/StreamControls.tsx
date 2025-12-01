import React, { useState, useRef, useEffect, useMemo } from 'react'
import { Video, Mic, MicOff, VideoOff, Play, Square, Upload, AlertCircle, Download, X, Wifi, WifiOff, RefreshCw, Camera, Monitor } from 'lucide-react'
import { getDefaultStreamStartUrl, generateStreamId } from '../utils/urls'
import { loadSettingsFromStorage } from './SettingsModal'
import ErrorModal from './ErrorModal'
import { 
  constructWhipUrl, 
  sendWhipOffer, 
  stopStream as stopStreamApi,
  sendStreamUpdate,
  StreamUpdateData,
  fetchStreamStatus,
  startStream as startStreamApi
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
  streamId?: string | null
  onTimeUpdate?: (currentTime: number) => void
  // Pass URLs from start response to parent for data streaming
  setDataUrlFromStart?: (url: string | null) => void
  setStatusUrlFromStart?: (url: string | null) => void
  setWhepUrlFromStart?: (url: string | null) => void
  // Error message for header display
  setErrorMessage?: (message: string | null) => void
}

const StreamControls: React.FC<StreamControlsProps> = ({
  isStreaming,
  setIsStreaming,
  setConnectionStatus,
  setStreamStats,
  setStreamId,
  setStreamName: setParentStreamName,
  setPlaybackUrl,
  streamId: parentStreamId,
  onTimeUpdate,
  setDataUrlFromStart,
  setStatusUrlFromStart,
  setWhepUrlFromStart,
  setErrorMessage
}) => {
  const [whipUrl, setWhipUrl] = useState(() => {
    const savedSettings = loadSettingsFromStorage()
    return savedSettings.whipUrl
  })
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

  // Listen for storage changes to update URL from settings
  useEffect(() => {
    const handleStorageChange = () => {
      const savedSettings = loadSettingsFromStorage()
      setWhipUrl(savedSettings.whipUrl)
      setPipeline(savedSettings.defaultPipeline)
    }
    
    const handleSettingsChange = (event: CustomEvent) => {
      if (event.detail?.whipUrl) {
        setWhipUrl(event.detail.whipUrl)
      }
      if (event.detail?.defaultPipeline) {
        setPipeline(event.detail.defaultPipeline)
      }
    }
    
    window.addEventListener('storage', handleStorageChange)
    window.addEventListener('live-settings-changed', handleSettingsChange as EventListener)
    
    return () => {
      window.removeEventListener('storage', handleStorageChange)
      window.removeEventListener('live-settings-changed', handleSettingsChange as EventListener)
    }
  }, [])
  const [pipeline, setPipeline] = useState(() => {
    const savedSettings = loadSettingsFromStorage()
    return savedSettings.defaultPipeline
  })
  const [jsonParams, setJsonParams] = useState('')
  const [videoEnabled, setVideoEnabled] = useState(true)
  const [customParams, setCustomParams] = useState<Record<string, any>>({})
  const [customParamKey, setCustomParamKey] = useState('')
  const [customParamValue, setCustomParamValue] = useState('')
  const [audioEnabled, setAudioEnabled] = useState(true)
  const [enableVideoIngress, setEnableVideoIngress] = useState(true)
  const [enableVideoEgress, setEnableVideoEgress] = useState(true)
  const [enableDataOutput, setEnableDataOutput] = useState(true)
  // Input type toggle: WHIP (WebRTC) or RTMP
  const [inputType, setInputType] = useState<'whip' | 'rtmp'>('whip')
  const [fpsLimit, setFpsLimit] = useState(30)
  const [resolution, setResolution] = useState('512x512')
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [peerConnection, setPeerConnection] = useState<RTCPeerConnection | null>(null)
  const [currentStreamId, setCurrentStreamId] = useState<string | null>(null)
  const [latestOffer, setLatestOffer] = useState<string>('')
  const [latestAnswer, setLatestAnswer] = useState<string>('')
  const [qualityIssues, setQualityIssues] = useState<string[]>([])
  const [isRecovering, setIsRecovering] = useState(false)
  const [reconnectAttempts, setReconnectAttempts] = useState(0)
  const [publisherStats, setPublisherStats] = useState({
    bitrate: 0,
    fps: 0,
    resolution: '',
    streamId: null as string | null
  })
  const [currentTime, setCurrentTime] = useState<number>(0)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamStartTimeRef = useRef<number | null>(null)
  const [sdpModalOpen, setSdpModalOpen] = useState(false)
  const [sdpModalContent, setSdpModalContent] = useState<{type: 'offer' | 'answer', content: string} | null>(null)
  
  // Status modal state
  const [statusModalOpen, setStatusModalOpen] = useState(false)
  const [statusData, setStatusData] = useState<any>(null)
  const [statusLoading, setStatusLoading] = useState(false)
  const [statusError, setStatusError] = useState<string | null>(null)
  
  // Error modal state
  const [errorModalOpen, setErrorModalOpen] = useState(false)
  const [errorModalTitle, setErrorModalTitle] = useState('')
  const [errorModalMessage, setErrorModalMessage] = useState('')
  
  // Store URLs from stream start response
  const statusUrlRef = useRef<string | null>(null)
  const updateUrlRef = useRef<string | null>(null)
  const [actualWhipUrl, setActualWhipUrl] = useState<string | null>(null)
  const [rtmpUrlFromStart, setRtmpUrlFromStart] = useState<string | null>(null)
  
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

  // Pipeline management functions
  const PIPELINES_STORAGE_KEY = 'livepeer-ai-saved-pipelines'
  
  const loadPipelinesFromStorage = (): string[] => {
    try {
      const saved = localStorage.getItem(PIPELINES_STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        return Array.isArray(parsed) ? parsed : []
      }
    } catch (error) {
      console.warn('Failed to load pipelines from localStorage:', error)
    }
    return ['comfystream', 'video-analysis', 'vtuber', 'passthrough', 'noop']
  }
  
  const savePipelinesToStorage = (pipelines: string[]) => {
    try {
      localStorage.setItem(PIPELINES_STORAGE_KEY, JSON.stringify(pipelines))
    } catch (error) {
      console.warn('Failed to save pipelines to localStorage:', error)
    }
  }
  
  const handlePipelineChange = (newValue: string) => {
    setPipeline(newValue)
  }
  
  // Save pipeline to saved list and settings after successful stream start
  const savePipelineAfterSuccess = (pipelineValue: string) => {
    if (!pipelineValue.trim()) return
    
    // Add to saved pipelines if not already in list
    if (!savedPipelines.includes(pipelineValue.trim())) {
      const updatedPipelines = [pipelineValue.trim(), ...savedPipelines]
      setSavedPipelines(updatedPipelines)
      savePipelinesToStorage(updatedPipelines)
    }
    
    // Save as default pipeline in settings
    const currentSettings = loadSettingsFromStorage()
    const updatedSettings = {
      ...currentSettings,
      defaultPipeline: pipelineValue.trim()
    }
    try {
      localStorage.setItem('livepeer-ai-video-streaming-url-settings', JSON.stringify(updatedSettings))
    } catch (error) {
      console.warn('Failed to save default pipeline:', error)
    }
  }
  
  const selectPipeline = (pipelineValue: string) => {
    handlePipelineChange(pipelineValue)
    setShowPipelineDropdown(false)
  }
  
  const clearAllPipelines = () => {
    // Reset to default pipelines
    const defaultPipelines = ['comfystream', 'video-analysis', 'vtuber', 'passthrough', 'noop']
    setSavedPipelines(defaultPipelines)
    savePipelinesToStorage(defaultPipelines)
    setShowPipelineDropdown(false)
  }

  // Helper functions for custom parameters
  const addCustomParam = () => {
    if (customParamKey.trim() && customParamValue.trim()) {
      let parsedValue: any = customParamValue.trim()
      
      // Try to parse as JSON if it looks like a JSON value
      try {
        if (parsedValue.startsWith('{') || parsedValue.startsWith('[') || 
            parsedValue === 'true' || parsedValue === 'false' || 
            !isNaN(Number(parsedValue))) {
          parsedValue = JSON.parse(parsedValue)
        }
      } catch {
        // Keep as string if JSON parsing fails
      }
      
      setCustomParams(prev => ({
        ...prev,
        [customParamKey.trim()]: parsedValue
      }))
      setCustomParamKey('')
      setCustomParamValue('')
    }
  }

  const removeCustomParam = (key: string) => {
    setCustomParams(prev => {
      const newParams = { ...prev }
      delete newParams[key]
      return newParams
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && customParamKey.trim() && customParamValue.trim()) {
      e.preventDefault()
      addCustomParam()
    }
  }

  useEffect(() => {
    return () => {
      if (statsIntervalRef.current) {
        clearInterval(statsIntervalRef.current)
        statsIntervalRef.current = null
      }
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop())
      }
      if (peerConnection) {
        peerConnection.close()
      }
    }
  }, [localStream, peerConnection])

  // Load media devices on component mount
  useEffect(() => {
    loadMediaDevices()
  }, [])

  // Track current time of the video relative to when WebRTC connection was established
  useEffect(() => {
    if (!videoRef.current || !onTimeUpdate) return
    
    const updateTime = () => {
      if (videoRef.current && videoRef.current.currentTime) {
        // If we have a stream start reference, calculate time relative to stream start
        // Otherwise use the raw video currentTime
        const time = streamStartTimeRef.current !== null 
          ? videoRef.current.currentTime - streamStartTimeRef.current
          : videoRef.current.currentTime
        
        setCurrentTime(time)
        onTimeUpdate(time)
      }
    }

    const interval = setInterval(updateTime, 100) // Update 10 times per second
    
    // Initial update
    updateTime()
    
    return () => {
      clearInterval(interval)
    }
  }, [videoRef.current, onTimeUpdate, streamStartTimeRef.current])

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

  const showErrorModal = (title: string, message: string) => {
    setErrorModalTitle(title)
    setErrorModalMessage(message)
    setErrorModalOpen(true)
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
      showErrorModal('WHIP URL Required', 'Please enter a WHIP URL to start streaming')
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
      showErrorModal('WHIP URL Required', 'Please enter a WHIP URL to start streaming')
      return
    }

    try {
      setConnectionStatus('connecting')
      const [width, height] = resolution.split('x').map(Number)

      // Start params should contain height, width, and all custom parameter key/values
      const params = {
        height,
        width,
        ...customParams,
      }

      // Start the stream using the API function
      const urls = await startStreamApi(whipUrl, streamName, pipeline, params, {
        enable_video_ingress: enableVideoIngress,
        enable_video_egress: enableVideoEgress,
        enable_data_output: enableDataOutput
      })

      // Capture URLs from start response for later use
      if (urls?.status_url && typeof urls.status_url === 'string') {
        statusUrlRef.current = urls.status_url
        if (setStatusUrlFromStart) setStatusUrlFromStart(urls.status_url)
      }
      if (urls?.data_url && typeof urls.data_url === 'string') {
        if (setDataUrlFromStart) setDataUrlFromStart(urls.data_url)
      }
      if (urls?.update_url && typeof urls.update_url === 'string') {
        updateUrlRef.current = urls.update_url
      }
      if (urls?.whip_url && typeof urls.whip_url === 'string') {
        setActualWhipUrl(urls.whip_url)
      }
      if (urls?.whep_url && typeof urls.whep_url === 'string') {
        if (setWhepUrlFromStart) setWhepUrlFromStart(urls.whep_url)
      }
      if (urls?.rtmp_url && typeof urls.rtmp_url === 'string') {
        setRtmpUrlFromStart(urls.rtmp_url)
      }

      // Use streamId from response or generate one as fallback
      const streamId = urls?.stream_id
      setCurrentStreamId(streamId)
      setStreamId(streamId) // Also update parent state
            
      // If RTMP input selected or video ingress is disabled, skip WebRTC setup and WHIP request
      if (inputType === 'rtmp' || !enableVideoIngress) {
        console.log('Skipping WebRTC/WHIP setup (RTMP mode or ingress disabled)')
        setIsStreaming(true)
        setConnectionStatus('connected')
        
        // Save pipeline after successful stream start
        savePipelineAfterSuccess(pipeline)
        return
      }
      
      // Get user media with selected devices
      
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

      // Enhanced connection state monitoring
      pc.addEventListener('connectionstatechange', () => {
        console.log(`Publisher connection state: ${pc.connectionState}`)
        if (pc.connectionState === 'connected') {
          setConnectionStatus('connected')
          setIsRecovering(false)
          
          // When WebRTC connection is established, store the current video time as reference point
          if (videoRef.current) {
            console.log(`Setting stream start reference at ${videoRef.current.currentTime}s`)
            streamStartTimeRef.current = videoRef.current.currentTime
          }
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
      const constructedUrl = constructWhipUrl(whipUrl, streamName, pipeline, resWidth, resHeight, customParams, streamId)
      console.log(`Constructed WHIP URL: ${constructedUrl}`)
      
      // Send WHIP offer with retry logic
      const response = await sendWhipOffer(urls.whip_url, currentSdp)

      if (response.status == 201) {
        const answerSdp = response.answerSdp
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
        setPlaybackUrl(playbackUrl)
        
        // Save pipeline after successful stream start
        savePipelineAfterSuccess(pipeline)
        
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
      if (setErrorMessage) {
        setErrorMessage(error instanceof Error ? error.message : String(error))
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
        await stopStreamApi({ streamId: currentStreamId, whipUrl, pipeline })
      }
    } catch (error) {
      console.error('Error sending stop request:', error)
      if (setErrorMessage) {
        setErrorMessage(error instanceof Error ? error.message : String(error))
      }
    }
    
    // Clear any previous error when stopping
    if (setErrorMessage) {
      setErrorMessage(null)
    }
    
    // Clear stats collection interval
    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current)
      statsIntervalRef.current = null
    }
    
    // Reset connection state
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

    // Reset the stream start time reference
    streamStartTimeRef.current = null
    
    // Reset the current time and notify
    setCurrentTime(0)
    if (onTimeUpdate) {
      onTimeUpdate(null)
    }

    setIsStreaming(false)
    setConnectionStatus('disconnected')
    setStreamId(null)
    setCurrentStreamId(null)
    setPlaybackUrl(null)
    
    // Reset URLs from start response
    statusUrlRef.current = null
    updateUrlRef.current = null
    setActualWhipUrl(null)
  setRtmpUrlFromStart(null)
    if (setDataUrlFromStart) setDataUrlFromStart(null)
    if (setStatusUrlFromStart) setStatusUrlFromStart(null)
    if (setWhepUrlFromStart) setWhepUrlFromStart(null)
    
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
  
  // Update function to send custom parameters and resolution changes
  const sendUpdate = async () => {
    if (!isStreaming) {
      showErrorModal('No Active Stream', 'No active stream to update. Please start streaming first.')
      return
    }

    if (!updateUrlRef.current) {
      showErrorModal('Update URL Unavailable', 'Update URL not available from stream start')
      return
    }

    if (!currentStreamId) {
      showErrorModal('Stream ID Unavailable', 'Stream ID not available')
      return
    }

    try {
      // Get current resolution
      const [resWidth, resHeight] = resolution.split('x').map(Number)
      
      const updateData: StreamUpdateData = {
        ...customParams
      }

      // Use the update URL from the stream start response
      await sendStreamUpdate({
        updateUrl: updateUrlRef.current,
        streamId: currentStreamId,
        pipeline: pipeline,
        updateData
      })
      
      // You could show a success message here
    } catch (error) {
      console.error('Error sending update:', error)
      showErrorModal('Update Failed', error instanceof Error ? error.message : 'Failed to send update')
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

  // Function to handle status modal
  const handleOpenStatusModal = async () => {
    try {
      setStatusLoading(true)
      setStatusError(null)
      setStatusModalOpen(true)
      
      // Use parentStreamId (from App component) or fallback to currentStreamId
      const streamIdToUse = parentStreamId || currentStreamId
      
      // If we're streaming but don't have a stream ID, that's an error
      if (isStreaming && !streamIdToUse) {
        throw new Error('Stream is active but no stream ID is available. This may indicate a timing issue - please try again.')
      }
      
      // If we're not streaming and have no stream ID, we'll fetch general status
      if (!streamIdToUse) {
        console.log('No stream ID available, fetching general system status')
      } else {
        console.log(`Fetching status for stream: ${streamIdToUse}`)
      }
      
      const data = await fetchStreamStatus(statusUrlRef.current || undefined)
      setStatusData(data)
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : 'Failed to fetch status')
      setStatusData(null)
    } finally {
      setStatusLoading(false)
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
            onTimeUpdate={(e) => {
              if (onTimeUpdate) {
                // If we have a stream start reference, calculate time relative to stream start
                // Otherwise use the raw video currentTime
                const time = streamStartTimeRef.current !== null 
                  ? e.currentTarget.currentTime - streamStartTimeRef.current
                  : e.currentTarget.currentTime
                
                setCurrentTime(time)
                onTimeUpdate(time)
              }
            }}
          />
          {/* RTMP Instruction Overlay */}
          {isStreaming && inputType === 'rtmp' && (
            <RtmpOverlay rtmpUrl={rtmpUrlFromStart} />
          )}
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
              
              {/* Connection Status Indicators */}
              {isStreaming && (
                <div className="flex items-center space-x-2">
                  {isRecovering && (
                    <button 
                      onClick={handleOpenStatusModal}
                      className="flex items-center space-x-1 text-amber-400 hover:text-amber-300 transition-colors cursor-pointer p-1 rounded"
                      title="Click to view stream status details"
                    >
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span className="text-xs">Recovering</span>
                    </button>
                  )}
                  
                  {qualityIssues.length > 0 && !isRecovering && (
                    <button 
                      onClick={handleOpenStatusModal}
                      className="flex items-center space-x-1 text-red-400 hover:text-red-300 transition-colors cursor-pointer p-1 rounded"
                      title="Click to view stream status details"
                    >
                      <WifiOff className="w-4 h-4" />
                      <span className="text-xs">{qualityIssues.length} issue{qualityIssues.length > 1 ? 's' : ''}</span>
                    </button>
                  )}
                  
                  {qualityIssues.length === 0 && !isRecovering && (
                    <button 
                      onClick={handleOpenStatusModal}
                      className="flex items-center space-x-1 text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer p-1 rounded"
                      title="Click to view stream status details"
                    >
                      <Wifi className="w-4 h-4" />
                    </button>
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
            {/* Input Type Toggle */}
            <div className="p-4 bg-gradient-to-br from-black/30 to-black/10 rounded-lg border border-white/20 backdrop-blur-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-white flex items-center">
                  <Camera className="w-5 h-5 mr-2 text-emerald-400" />
                  Input Type
                </h3>
              </div>
              <div className="inline-flex rounded-lg overflow-hidden border border-white/20">
                <button
                  type="button"
                  onClick={() => setInputType('whip')}
                  className={`px-4 py-2 text-sm font-medium ${inputType === 'whip' ? 'bg-emerald-600 text-white' : 'bg-black/40 text-gray-300 hover:bg-white/10'}`}
                  disabled={isStreaming}
                >
                  WHIP (WebRTC)
                </button>
                <button
                  type="button"
                  onClick={() => setInputType('rtmp')}
                  className={`px-4 py-2 text-sm font-medium ${inputType === 'rtmp' ? 'bg-emerald-600 text-white' : 'bg-black/40 text-gray-300 hover:bg-white/10'}`}
                  disabled={isStreaming}
                >
                  RTMP
                </button>
              </div>
              {inputType === 'rtmp' && (
                <p className="mt-2 text-xs text-gray-400">In RTMP mode, the app won’t create a WebRTC connection. Start your encoder with the RTMP URL shown above after starting the stream.</p>
              )}
            </div>

            {/* Media Device Selection */}
            <div className="p-4 bg-gradient-to-br from-black/30 to-black/10 rounded-lg border border-white/20 backdrop-blur-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-white flex items-center">
                  <Camera className="w-5 h-5 mr-2 text-emerald-400" />
                  Media Sources
                </h3>
                <button
                  onClick={refreshMediaDevices}
                  className="p-2 text-gray-400 hover:text-emerald-400 hover:bg-emerald-400/10 rounded-lg transition-all duration-200"
                  title="Refresh devices"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Camera Selection */}
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-gray-300 mb-2 flex items-center">
                    <Video className="w-3 h-3 mr-1 text-blue-400" />
                    Camera
                  </label>
                  <div className="relative">
                    <select
                      value={selectedCamera}
                      onChange={(e) => setSelectedCamera(e.target.value)}
                      className="w-full px-3 py-2.5 bg-black/40 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-400 transition-all duration-200 appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={useScreenShare}
                    >
                      <option value="" className="bg-gray-800">Select Camera</option>
                      {cameras.map((camera) => (
                        <option key={camera.deviceId} value={camera.deviceId} className="bg-gray-800">
                          {camera.label}
                        </option>
                      ))}
                    </select>
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                  {!selectedCamera && !useScreenShare && (
                    <p className="text-xs text-red-400">No camera selected</p>
                  )}
                  {useScreenShare && (
                    <p className="text-xs text-amber-400">Screen share enabled</p>
                  )}
                </div>

                {/* Microphone Selection */}
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-gray-300 mb-2 flex items-center">
                    <Mic className="w-3 h-3 mr-1 text-purple-400" />
                    Microphone
                  </label>
                  <div className="relative">
                    <select
                      value={selectedMicrophone}
                      onChange={(e) => setSelectedMicrophone(e.target.value)}
                      className="w-full px-3 py-2.5 bg-black/40 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-400 transition-all duration-200 appearance-none cursor-pointer"
                    >
                      <option value="" className="bg-gray-800">Select Microphone</option>
                      {microphones.map((mic) => (
                        <option key={mic.deviceId} value={mic.deviceId} className="bg-gray-800">
                          {mic.label}
                        </option>
                      ))}
                    </select>
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                  {!selectedMicrophone && (
                    <p className="text-xs text-yellow-400">No microphone selected</p>
                  )}
                </div>

                {/* Screen Share Toggle */}
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-gray-300 mb-2 flex items-center">
                    <Monitor className="w-3 h-3 mr-1 text-green-400" />
                    Screen Share
                  </label>
                  <button
                    onClick={handleScreenShare}
                    className={`w-full flex items-center justify-center space-x-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                      useScreenShare
                        ? 'bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600 text-white shadow-lg shadow-green-500/25'
                        : 'bg-gray-700/50 hover:bg-gray-600/50 text-gray-300 border border-white/10'
                    }`}
                  >
                    <Monitor className="w-4 h-4" />
                    <span>{useScreenShare ? 'Screen Share ON' : 'Screen Share OFF'}</span>
                    {useScreenShare && (
                      <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                    )}
                  </button>
                </div>
              </div>

              {/* Selected Source Info */}
              <div className="mt-4 p-3 bg-black/30 rounded-lg border border-white/10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-medium text-gray-400">Video:</span>
                      {useScreenShare ? (
                        <div className="flex items-center space-x-1">
                          <Monitor className="w-3 h-3 text-green-400" />
                          <span className="text-xs text-green-400 font-medium">Screen Share</span>
                        </div>
                      ) : selectedCamera ? (
                        <div className="flex items-center space-x-1">
                          <Video className="w-3 h-3 text-blue-400" />
                          <span className="text-xs text-blue-400 font-medium">
                            {cameras.find(c => c.deviceId === selectedCamera)?.label?.split('(')[0].trim() || 'Camera'}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center space-x-1">
                          <VideoOff className="w-3 h-3 text-red-400" />
                          <span className="text-xs text-red-400">None</span>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-medium text-gray-400">Audio:</span>
                      {selectedMicrophone ? (
                        <div className="flex items-center space-x-1">
                          <Mic className="w-3 h-3 text-purple-400" />
                          <span className="text-xs text-purple-400 font-medium">
                            {microphones.find(m => m.deviceId === selectedMicrophone)?.label?.split('(')[0].trim() || 'Microphone'}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center space-x-1">
                          <MicOff className="w-3 h-3 text-yellow-400" />
                          <span className="text-xs text-yellow-400">None</span>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-1">
                    {(useScreenShare || selectedCamera) && selectedMicrophone ? (
                      <div className="flex items-center space-x-1">
                        <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                        <span className="text-xs text-green-400 font-medium">Ready</span>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-1">
                        <div className="w-2 h-2 bg-yellow-400 rounded-full"></div>
                        <span className="text-xs text-yellow-400 font-medium">Incomplete</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Stream Start URL Input */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Stream Start URL
              </label>
              <div className="relative">
                <input
                  type="url"
                  value={whipUrl}
                  onChange={(e) => setWhipUrl(e.target.value)}
                  placeholder={getDefaultStreamStartUrl()}
                  className="w-full px-4 py-3 bg-black/20 border border-white/10 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  disabled={isStreaming}
                />
                <Upload className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              </div>
            </div>

            {/* Actual WHIP Endpoint URL Display */}
            {actualWhipUrl && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  WHIP Endpoint URL (from response)
                </label>
                <div className="relative">
                  <input
                    type="url"
                    value={actualWhipUrl}
                    className="w-full px-4 py-3 bg-black/20 border border-white/10 rounded-lg text-green-400 cursor-not-allowed"
                    disabled={true}
                  />
                  <Upload className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                </div>
                <p className="text-xs text-green-400 mt-1">Actual WHIP endpoint from stream start response</p>
              </div>
            )}

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
              <div className="relative">
                <input
                  type="text"
                  value={pipeline}
                  onChange={(e) => handlePipelineChange(e.target.value)}
                  onFocus={() => setShowPipelineDropdown(true)}
                  placeholder="Default: noop"
                  className="w-full px-4 py-3 pr-10 bg-black/20 border border-white/10 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  disabled={isStreaming}
                />
                <button
                  type="button"
                  onClick={() => setShowPipelineDropdown(!showPipelineDropdown)}
                  disabled={isStreaming}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1.5 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
                  title="Show saved pipelines"
                >
                  <ChevronDown className="w-5 h-5" />
                </button>
              </div>
              
              {/* Dropdown List */}
              {showPipelineDropdown && savedPipelines.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-slate-800 border border-white/20 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                  {/* Reset to Default Button */}
                  <div className="border-b border-white/10">
                    <button
                      type="button"
                      onClick={clearAllPipelines}
                      className="w-full px-4 py-2.5 text-left text-sm text-orange-400 hover:bg-orange-900/30 transition-colors flex items-center"
                      title="Reset to default pipelines"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Reset to Default List
                    </button>
                  </div>
                  {savedPipelines.map((savedPipeline, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => selectPipeline(savedPipeline)}
                      className={`w-full px-4 py-2.5 text-left text-sm transition-colors ${
                        pipeline === savedPipeline
                          ? 'bg-emerald-600 text-white'
                          : 'text-gray-300 hover:bg-slate-700'
                      }`}
                    >
                      {savedPipeline}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Stream Configuration Checkboxes */}
            <div className="p-4 bg-gradient-to-br from-emerald-900/20 to-blue-900/20 rounded-xl border border-emerald-500/20 backdrop-blur-sm">
              <label className="block text-sm font-medium text-gray-300 mb-3">
                Stream Configuration
              </label>
              <div className="space-y-3">
                <div className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    id="enableVideoIngress"
                    checked={enableVideoIngress}
                    onChange={(e) => setEnableVideoIngress(e.target.checked)}
                    disabled={isStreaming}
                    className="w-4 h-4 text-emerald-600 bg-black/30 border-white/20 rounded focus:ring-emerald-500 focus:ring-2 disabled:opacity-50"
                  />
                  <label htmlFor="enableVideoIngress" className="text-sm text-gray-300 cursor-pointer">
                    Enable Video Ingress
                  </label>
                </div>
                <div className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    id="enableVideoEgress"
                    checked={enableVideoEgress}
                    onChange={(e) => setEnableVideoEgress(e.target.checked)}
                    disabled={isStreaming}
                    className="w-4 h-4 text-emerald-600 bg-black/30 border-white/20 rounded focus:ring-emerald-500 focus:ring-2 disabled:opacity-50"
                  />
                  <label htmlFor="enableVideoEgress" className="text-sm text-gray-300 cursor-pointer">
                    Enable Video Egress
                  </label>
                </div>
                <div className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    id="enableDataOutput"
                    checked={enableDataOutput}
                    onChange={(e) => setEnableDataOutput(e.target.checked)}
                    disabled={isStreaming}
                    className="w-4 h-4 text-emerald-600 bg-black/30 border-white/20 rounded focus:ring-emerald-500 focus:ring-2 disabled:opacity-50"
                  />
                  <label htmlFor="enableDataOutput" className="text-sm text-gray-300 cursor-pointer">
                    Enable Data Output
                  </label>
                </div>
              </div>
              {!enableVideoIngress && (
                <div className="mt-3 p-2 bg-amber-900/20 border border-amber-500/30 rounded-lg">
                  <p className="text-xs text-amber-300">
                    <strong>Note:</strong> When Video Ingress is disabled, no WebRTC connection will be established. The stream will start without video input.
                  </p>
                </div>
              )}
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
              <div className="relative">
                <input
                  type="text"
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                  list="resolution-options"
                  placeholder="e.g., 1280x720"
                  className="w-full px-3 py-3 bg-black/40 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-400 disabled:opacity-50"
                  disabled={isStreaming}
                />
                <datalist id="resolution-options">
                  <option value="512x512">512x512 (SD Square)</option>
                  <option value="512x704">512x704 (Portrait)</option>
                  <option value="640x480">640x480 (VGA)</option>
                  <option value="704x512">704x512 (Landscape)</option>
                  <option value="768x768">768x768 (Square HD)</option>
                  <option value="854x480">854x480 (FWVGA)</option>
                  <option value="1024x1024">1024x1024 (Square FHD)</option>
                  <option value="1280x720">1280x720 (HD)</option>
                  <option value="1920x1080">1920x1080 (Full HD)</option>
                  <option value="2560x1440">2560x1440 (QHD)</option>
                  <option value="3840x2160">3840x2160 (4K UHD)</option>
                </datalist>
              </div>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                {isStreaming ? 'Stop stream to change resolution' : 'Select video resolution before starting stream'}
              </p>
            </div>

            {/* Custom Parameters Container */}
            <div className="p-4 bg-gradient-to-br from-blue-900/20 to-purple-900/20 rounded-xl border border-blue-500/20 backdrop-blur-sm">
              <label className="block text-sm font-medium text-gray-300 mb-3">
                Custom Parameters & Updates
              </label>
              
              {/* Add Parameter Input */}
              <div className="space-y-3 mb-4">
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={customParamKey}
                    onChange={(e) => setCustomParamKey(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Parameter key"
                    className="flex-1 px-3 py-2 bg-black/30 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <input
                    type="text"
                    value={customParamValue}
                    onChange={(e) => setCustomParamValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Parameter value (string, number, or JSON)"
                    className="flex-2 px-3 py-2 bg-black/30 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <button
                    onClick={addCustomParam}
                    disabled={!customParamKey.trim() || !customParamValue.trim()}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                  >
                    Add
                  </button>
                </div>
                <p className="text-xs text-gray-400">
                  Values will be parsed as JSON if they look like objects, arrays, booleans, or numbers. Otherwise treated as strings. Press Enter to add.
                </p>
              </div>

              {/* Current Parameters Display */}
              {Object.keys(customParams).length > 0 && (
                <div className="space-y-2 mb-4">
                  <h4 className="text-sm font-medium text-gray-300">Current Parameters:</h4>
                  <div className="bg-black/30 border border-white/20 rounded-lg p-3 max-h-32 overflow-y-auto">
                    {Object.entries(customParams).map(([key, value]) => (
                      <div key={key} className="flex items-center justify-between py-1">
                        <div className="flex-1 min-w-0">
                          <span className="text-sm text-emerald-400 font-mono">{key}</span>
                          <span className="text-gray-300 mx-2">:</span>
                          <span className="text-sm text-white font-mono">
                            {typeof value === 'string' ? `"${value}"` : JSON.stringify(value)}
                          </span>
                        </div>
                        <button
                          onClick={() => removeCustomParam(key)}
                          className="ml-2 p-1 text-red-400 hover:text-red-300 transition-colors"
                          title="Remove parameter"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={sendUpdate}
                disabled={!isStreaming}
                className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
              >
                Update Stream
              </button>
              <p className="text-xs text-gray-400 mt-2 text-center">
                Send custom parameters and current resolution to active stream
              </p>
            </div>

            {!whipUrl && (
              <div className="flex items-center space-x-2 text-amber-400 text-sm">
                <AlertCircle className="w-4 h-4" />
                <span>Enter a Stream Start URL to start streaming</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Media Device Selection Modal */}
      {showMediaModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-white/20 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-white flex items-center">
                <Camera className="w-6 h-6 mr-2 text-emerald-400" />
                Select Media Sources
              </h3>
              <button
                onClick={() => setShowMediaModal(false)}
                className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-all duration-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-5">
              {/* Camera Selection */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-300 mb-2 flex items-center">
                  <Video className="w-4 h-4 mr-2 text-blue-400" />
                  Camera
                </label>
                <div className="relative">
                  <select
                    value={selectedCamera}
                    onChange={(e) => setSelectedCamera(e.target.value)}
                    className="w-full px-3 py-3 bg-black/40 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-400 transition-all duration-200 appearance-none cursor-pointer disabled:opacity-50"
                    disabled={useScreenShare}
                  >
                    <option value="" className="bg-gray-800">Select Camera</option>
                    {cameras.map((camera) => (
                      <option key={camera.deviceId} value={camera.deviceId} className="bg-gray-800">
                        {camera.label}
                      </option>
                    ))}
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
                {useScreenShare && (
                  <p className="text-xs text-amber-400">Camera disabled when screen sharing</p>
                )}
              </div>

              {/* Microphone Selection */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-300 mb-2 flex items-center">
                  <Mic className="w-4 h-4 mr-2 text-purple-400" />
                  Microphone
                </label>
                <div className="relative">
                  <select
                    value={selectedMicrophone}
                    onChange={(e) => setSelectedMicrophone(e.target.value)}
                    className="w-full px-3 py-3 bg-black/40 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-400 transition-all duration-200 appearance-none cursor-pointer"
                  >
                    <option value="" className="bg-gray-800">Select Microphone</option>
                    {microphones.map((mic) => (
                      <option key={mic.deviceId} value={mic.deviceId} className="bg-gray-800">
                        {mic.label}
                      </option>
                    ))}
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Screen Share Toggle */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-300 mb-2 flex items-center">
                  <Monitor className="w-4 h-4 mr-2 text-green-400" />
                  Screen Share
                </label>
                <button
                  onClick={() => setUseScreenShare(!useScreenShare)}
                  className={`w-full flex items-center justify-center space-x-2 px-3 py-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                    useScreenShare
                      ? 'bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600 text-white shadow-lg shadow-green-500/25'
                      : 'bg-gray-700/50 hover:bg-gray-600/50 text-gray-300 border border-white/10'
                  }`}
                >
                  <Monitor className="w-4 h-4" />
                  <span>{useScreenShare ? 'Screen Share ON' : 'Screen Share OFF'}</span>
                  {useScreenShare && (
                    <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                  )}
                </button>
              </div>

              {/* Selected Source Info */}
              <div className="p-4 bg-black/30 rounded-lg border border-white/10">
                <p className="text-xs font-medium text-gray-400 mb-3">Selected Sources:</p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-300">Video:</span>
                    {useScreenShare ? (
                      <div className="flex items-center space-x-2">
                        <Monitor className="w-4 h-4 text-green-400" />
                        <span className="text-sm text-green-400 font-medium">Screen Share</span>
                      </div>
                    ) : selectedCamera ? (
                      <div className="flex items-center space-x-2">
                        <Video className="w-4 h-4 text-blue-400" />
                        <span className="text-sm text-blue-400 font-medium truncate max-w-[180px]">
                          {cameras.find(c => c.deviceId === selectedCamera)?.label?.split('(')[0].trim() || 'Camera'}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-2">
                        <VideoOff className="w-4 h-4 text-red-400" />
                        <span className="text-sm text-red-400">None</span>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-300">Audio:</span>
                    {selectedMicrophone ? (
                      <div className="flex items-center space-x-2">
                        <Mic className="w-4 h-4 text-purple-400" />
                        <span className="text-sm text-purple-400 font-medium truncate max-w-[180px]">
                          {microphones.find(m => m.deviceId === selectedMicrophone)?.label?.split('(')[0].trim() || 'Microphone'}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-2">
                        <MicOff className="w-4 h-4 text-yellow-400" />
                        <span className="text-sm text-yellow-400">None</span>
                      </div>
                    )}
                  </div>

                  <div className="pt-2 border-t border-white/10">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-400">Status:</span>
                      {(useScreenShare || selectedCamera) && selectedMicrophone ? (
                        <div className="flex items-center space-x-1">
                          <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                          <span className="text-xs text-green-400 font-medium">Ready to stream</span>
                        </div>
                      ) : (
                        <div className="flex items-center space-x-1">
                          <div className="w-2 h-2 bg-yellow-400 rounded-full"></div>
                          <span className="text-xs text-yellow-400 font-medium">Setup incomplete</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex space-x-3 mt-6">
              <button
                onClick={() => setShowMediaModal(false)}
                className="flex-1 px-4 py-3 bg-gray-600/50 hover:bg-gray-600/70 text-white rounded-lg transition-all duration-200 font-medium border border-white/10"
              >
                Cancel
              </button>
              <button
                onClick={handleStreamWithDevices}
                disabled={!useScreenShare && !selectedCamera}
                className="flex-1 px-4 py-3 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 text-white rounded-lg transition-all duration-200 disabled:from-gray-600 disabled:to-gray-600 disabled:cursor-not-allowed font-medium shadow-lg disabled:shadow-none"
              >
                Start Stream
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status Modal */}
      {statusModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
            onClick={() => setStatusModalOpen(false)}
          />
          
          {/* Modal */}
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="relative bg-slate-800 rounded-lg w-full max-w-2xl max-h-[80vh] overflow-hidden shadow-xl">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-gray-700">
                <h2 className="text-lg font-semibold text-white">
                  {(parentStreamId || currentStreamId) ? `Stream Status: ${parentStreamId || currentStreamId}` : 'System Status'}
                </h2>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleOpenStatusModal}
                    disabled={statusLoading}
                    className="p-1 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
                    title="Refresh"
                  >
                    <RefreshCw className={`w-4 h-4 ${statusLoading ? 'animate-spin' : ''}`} />
                  </button>
                  <button
                    onClick={() => setStatusModalOpen(false)}
                    className="p-1 text-gray-400 hover:text-white transition-colors"
                    title="Close"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="p-4 max-h-[60vh] overflow-y-auto">
                {statusLoading && !statusData && (
                  <div className="flex items-center justify-center py-8">
                    <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
                    <span className="ml-2 text-gray-400">Loading...</span>
                  </div>
                )}

                {statusError && (
                  <div className="bg-red-900/50 border border-red-700 rounded-lg p-4 mb-4">
                    <h3 className="text-red-400 font-semibold mb-2">Error</h3>
                    <p className="text-red-300 text-sm">{statusError}</p>
                  </div>
                )}

                {statusData && (
                  <div className="space-y-4">
                    <div className="bg-slate-700 rounded-lg p-4">
                      <h3 className="text-white font-semibold mb-3">Status Data</h3>
                      <pre className="text-xs text-gray-300 overflow-x-auto whitespace-pre-wrap bg-slate-900 p-3 rounded border">
                        {JSON.stringify(statusData, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}

                {!statusLoading && !statusError && !statusData && (
                  <div className="text-center py-8">
                    <p className="text-gray-400">No status data available</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Error Modal */}
      <ErrorModal
        isOpen={errorModalOpen}
        title={errorModalTitle}
        message={errorModalMessage}
        onClose={() => setErrorModalOpen(false)}
      />
    </>
  )
}

export default StreamControls

// Lightweight subcomponent to keep render clean
const RtmpOverlay: React.FC<{ rtmpUrl: string | null }> = ({ rtmpUrl }) => {
  const { base, key } = useMemo(() => {
    if (!rtmpUrl) return { base: '', key: '' }
    try {
      const u = new URL(rtmpUrl)
      const segments = u.pathname.split('/').filter(Boolean)
      if (segments.length === 0) {
        return { base: `${u.protocol}//${u.host}/`, key: '' }
      }
      const streamKey = segments[segments.length - 1]
      const prefix = segments.slice(0, -1).join('/')
      const basePath = prefix ? `/${prefix}/` : '/'
      return { base: `${u.protocol}//${u.host}${basePath}`, key: streamKey }
    } catch {
      // Fallback string split if URL parsing fails
      const qsIdx = rtmpUrl.indexOf('?')
      const clean = qsIdx >= 0 ? rtmpUrl.slice(0, qsIdx) : rtmpUrl
      const lastSlash = clean.lastIndexOf('/')
      if (lastSlash > 0) {
        return { base: clean.slice(0, lastSlash + 1), key: clean.slice(lastSlash + 1) }
      }
      return { base: clean, key: '' }
    }
  }, [rtmpUrl])

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black p-4">
      <div className="text-center max-w-3xl">
        <p className="text-lg md:text-xl font-semibold text-white">Start RTMP stream</p>
        {rtmpUrl ? (
          <>
            <p className="mt-2 text-sm md:text-base text-emerald-300 font-mono break-all">{base}</p>
            <p className="mt-1 text-sm md:text-base text-emerald-300 font-mono break-all">{key}</p>
          </>
        ) : (
          <p className="mt-2 text-sm md:text-base text-emerald-300">Waiting for RTMP URL from server...</p>
        )}
        <p className="mt-3 text-xs text-gray-300">Use your encoder (OBS, ffmpeg, etc.) with the base URL and stream key above.</p>
      </div>
    </div>
  )
}
