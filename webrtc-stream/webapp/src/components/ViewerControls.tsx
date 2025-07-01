import React, { useState, useRef, useEffect } from 'react'
import { Play, Square, Monitor, AlertCircle, Download } from 'lucide-react'

interface ViewerControlsProps {
  isViewing: boolean
  setIsViewing: (viewing: boolean) => void
  setConnectionStatus: (status: 'disconnected' | 'connecting' | 'connected' | 'error') => void
  setStreamStats: (stats: any) => void
}

const ViewerControls: React.FC<ViewerControlsProps> = ({
  isViewing,
  setIsViewing,
  setConnectionStatus,
  setStreamStats
}) => {
  const [whepUrl, setWhepUrl] = useState('http://localhost:8088/gateway/process/request/stream/play')
  const [peerConnection, setPeerConnection] = useState<RTCPeerConnection | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    return () => {
      if (peerConnection) {
        peerConnection.close()
      }
    }
  }, [peerConnection])

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

      // Send WHEP offer
      const livepeerHeader = btoa(JSON.stringify(
                                        { 
                                          "request": JSON.stringify({"start_stream_output": true}),
                                          "parameters": JSON.stringify({}),
                                          "capability": 'webrtc-stream',
                                          "timeout_seconds": 30
                                        }
                                      )
                                    )
      const response = await fetch(whepUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/sdp',
          'Livepeer': livepeerHeader
        },
        body: offer.sdp
      })

      if (response.ok) {
        const answerSdp = await response.text()
        await pc.setRemoteDescription(new RTCSessionDescription({
          type: 'answer',
          sdp: answerSdp
        }))

        setIsViewing(true)
        setConnectionStatus('connected')
        
        // Update stats
        setStreamStats({
          bitrate: 2500,
          fps: 30,
          resolution: '1920x1080',
          latency: 120
        })
      } else {
        throw new Error('Failed to send WHEP offer')
      }

    } catch (error) {
      console.error('Error starting viewer:', error)
      setConnectionStatus('error')
    }
  }

  const stopViewing = () => {
    if (peerConnection) {
      peerConnection.close()
      setPeerConnection(null)
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null
    }

    setIsViewing(false)
    setConnectionStatus('disconnected')
    setStreamStats({
      bitrate: 0,
      fps: 0,
      resolution: '',
      latency: 0
    })
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
