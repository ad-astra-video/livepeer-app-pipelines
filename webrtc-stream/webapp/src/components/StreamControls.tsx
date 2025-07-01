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
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [peerConnection, setPeerConnection] = useState<RTCPeerConnection | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    return () => {
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
        video: videoEnabled,
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

      // Send WHIP offer
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
        body: offer.sdp
      })

      if (response.ok) {
        const answerSdp = await response.text()
        const streamId = response.headers.get('X-Stream-Id')
        
        await pc.setRemoteDescription(new RTCSessionDescription({
          type: 'answer',
          sdp: answerSdp
        }))

        setIsStreaming(true)
        setConnectionStatus('connected')
        setStreamId(streamId)
        
        // Update stats
        setStreamStats({
          bitrate: 2500,
          fps: 30,
          resolution: '1920x1080',
          latency: 150
        })
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

  const stopStream = () => {
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
    setStreamStats({
      bitrate: 0,
      fps: 0,
      resolution: '',
      latency: 0
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
