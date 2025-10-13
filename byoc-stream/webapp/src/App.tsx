import React, { useState, useRef, useEffect } from 'react'
import { Video, Mic, MicOff, VideoOff, Play, Square, Settings, Radio, Monitor, AlertTriangle } from 'lucide-react'
import StreamControls from './components/StreamControls'
import ViewerControls from './components/ViewerControls'
import ConnectionStatus from './components/ConnectionStatus'
import TabbedDataView from './components/TabbedDataView'
import SettingsModal, { UrlSettings } from './components/SettingsModal'

function App() {
  const [isStreaming, setIsStreaming] = useState(false)
  const [isViewing, setIsViewing] = useState(false)
  const [streamConnectionStatus, setStreamConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected')
  const [viewerConnectionStatus, setViewerConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected')
  const [streamId, setStreamId] = useState<string | null>(null)
  const [streamName, setStreamName] = useState<string | null>(null)
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null)
  
  // Error state
  const [streamErrorMessage, setStreamErrorMessage] = useState<string | null>(null)
  const [viewerErrorMessage, setViewerErrorMessage] = useState<string | null>(null)
  const [showErrorTooltip, setShowErrorTooltip] = useState(false)
  
  const [latestFrameTimestamp, setLatestFrameTimestamp] = useState<number | null>(null)
  const [processingDelay, setProcessingDelay] = useState<number | null>(null)
  const [sourceStreamTimestamp, setSourceStreamTimestamp] = useState<number | null>(null)
  const [streamStats, setStreamStats] = useState({
    bitrate: 0,
    fps: 0,
    resolution: '',
    latency: 0,
    streamId: null
  })
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false)
  const [urlSettings, setUrlSettings] = useState<UrlSettings | null>(null)
  
  // URLs from stream start response
  const [dataUrlFromStart, setDataUrlFromStart] = useState<string | null>(null)
  const [statusUrlFromStart, setStatusUrlFromStart] = useState<string | null>(null)
  const [whepUrlFromStart, setWhepUrlFromStart] = useState<string | null>(null)

  const handleSettingsChange = (settings: UrlSettings) => {
    setUrlSettings(settings)
  }

  const handleOpenSettings = () => {
    setIsSettingsModalOpen(true)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-emerald-900 to-slate-900">
      {/* Header */}
      <header className="bg-black/20 backdrop-blur-sm border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-r from-emerald-500 to-green-500 rounded-lg flex items-center justify-center">
                <Radio className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">Livepeer AI Video Streaming</h1>
                <p className="text-sm text-gray-300"></p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-3">
                <span className="text-sm text-gray-300">Stream:</span>
                <ConnectionStatus status={streamConnectionStatus} />
              </div>
              <div className="flex items-center space-x-3">
                <span className="text-sm text-gray-300">Viewer:</span>
                <ConnectionStatus status={viewerConnectionStatus} />
              </div>
              {/* Error Icon with Tooltip */}
              {(streamErrorMessage || viewerErrorMessage) && (
                <div className="relative">
                  <button 
                    className="p-2 text-amber-400 hover:text-amber-300 transition-colors"
                    title="Show Error Details"
                    onMouseEnter={() => setShowErrorTooltip(true)}
                    onMouseLeave={() => setShowErrorTooltip(false)}
                  >
                    <AlertTriangle className="w-5 h-5" />
                  </button>
                  
                  {showErrorTooltip && (
                    <div className="absolute right-0 top-full mt-2 w-72 bg-black/90 backdrop-blur-sm text-white text-xs p-3 rounded-lg border border-amber-500/30 z-[9999] shadow-xl">
                      <h4 className="text-amber-400 font-medium mb-2">Error Details</h4>
                      {streamErrorMessage && (
                        <div className="mb-2">
                          <p className="text-amber-300 font-medium">Stream Error:</p>
                          <p className="text-white/80 break-all">{streamErrorMessage}</p>
                        </div>
                      )}
                      {viewerErrorMessage && (
                        <div>
                          <p className="text-amber-300 font-medium">Viewer Error:</p>
                          <p className="text-white/80 break-all">{viewerErrorMessage}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              <button
                onClick={handleOpenSettings}
                className="p-2 text-gray-400 hover:text-white transition-colors"
                title="Settings - Configure URL defaults"
              >
                <Settings className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
          {/* Publisher Section */}
          <div className="xl:col-span-2">
            <div className="bg-black/20 backdrop-blur-sm rounded-xl p-4 border border-white/10 mb-4">
              <h3 className="text-lg font-semibold text-white mb-3 flex items-center">
                <Video className="w-5 h-5 mr-2 text-emerald-400" />
                Publish Stream
              </h3>
            </div>
            <StreamControls
              isStreaming={isStreaming}
              setIsStreaming={setIsStreaming}
              setConnectionStatus={setStreamConnectionStatus}
              setStreamStats={setStreamStats}
              setStreamId={setStreamId}
              setStreamName={setStreamName}
              setPlaybackUrl={setPlaybackUrl}
              streamId={streamId}
              onTimeUpdate={setSourceStreamTimestamp}
              setDataUrlFromStart={setDataUrlFromStart}
              setStatusUrlFromStart={setStatusUrlFromStart}
              setWhepUrlFromStart={setWhepUrlFromStart}
              setErrorMessage={setStreamErrorMessage}
            />
          </div>
          
          {/* Viewer Section */}
          <div className="xl:col-span-2">
            <div className="bg-black/20 backdrop-blur-sm rounded-xl p-4 border border-white/10 mb-4">
              <h3 className="text-lg font-semibold text-white mb-3 flex items-center">
                <Monitor className="w-5 h-5 mr-2 text-emerald-400" />
                View Stream
              </h3>
            </div>
            <ViewerControls
              isViewing={isViewing}
              setIsViewing={setIsViewing}
              setConnectionStatus={setViewerConnectionStatus}
              setStreamStats={setStreamStats}
              playbackUrl={playbackUrl}
              whepUrlFromStart={whepUrlFromStart}
              setErrorMessage={setViewerErrorMessage}
            />
            
            {/* Tabbed Data View Section */}
            <div className="mt-8">
              <TabbedDataView 
                streamName={streamName}
                isStreaming={isStreaming}
                latestFrameTimestamp={latestFrameTimestamp}
                sourceStreamTimestamp={sourceStreamTimestamp}
                processingDelay={processingDelay}
                dataUrlFromStart={dataUrlFromStart}
                onDataUpdate={(timestamp, delay) => {
                  if (timestamp !== null) {
                    setLatestFrameTimestamp(timestamp);
                    
                    if (delay !== null) {
                      setProcessingDelay(delay);
                      // Calculate frame time by subtracting delay from timestamp
                      const frameTime = timestamp - delay;
                      console.log(`App: frameTime=${frameTime}, delay=${delay}, timestamp=${timestamp}`);
                    }
                  } else {
                    setLatestFrameTimestamp(null);
                    setProcessingDelay(null);
                  }
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        onSave={handleSettingsChange}
      />
    </div>
  )
}

export default App
