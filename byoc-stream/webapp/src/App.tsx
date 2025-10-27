import React, { useState, useRef, useEffect } from 'react'
import { Video, Mic, MicOff, VideoOff, Play, Square, Settings, Radio, Monitor, AlertTriangle, X } from 'lucide-react'
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
  const [showErrorModal, setShowErrorModal] = useState(false)
  
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
              {/* Error Icon with Modal */}
              {(streamErrorMessage || viewerErrorMessage) && (
                <button 
                  className="p-2 text-amber-400 hover:text-amber-300 transition-colors"
                  title="Show Error Details"
                  onClick={() => setShowErrorModal(true)}
                >
                  <AlertTriangle className="w-5 h-5" />
                </button>
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

      {/* Error Modal */}
      {showErrorModal && (streamErrorMessage || viewerErrorMessage) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowErrorModal(false)}
          />
          
          {/* Modal */}
          <div className="relative bg-slate-900 border border-amber-500/30 rounded-xl w-full max-w-2xl mx-4 shadow-2xl flex flex-col max-h-[80vh]">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-amber-500/20 shrink-0">
              <div className="flex items-center space-x-3">
                <div className="flex items-center justify-center w-10 h-10 bg-amber-500/20 rounded-full">
                  <AlertTriangle className="w-6 h-6 text-amber-400" />
                </div>
                <div>
                  <h2 className="text-2xl font-semibold text-white">Error Details</h2>
                  <p className="text-sm text-gray-400 mt-1">
                    Connection errors from stream or viewer
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowErrorModal(false)}
                className="p-2 text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-6">
              <div className="space-y-4">
                {streamErrorMessage && (
                  <div className="bg-red-900/30 border border-red-500/30 rounded-lg p-4">
                    <h3 className="text-red-400 font-semibold mb-2 flex items-center">
                      <AlertTriangle className="w-5 h-5 mr-2" />
                      Stream Error
                    </h3>
                    <div className="bg-black/40 rounded-lg p-4 mt-3">
                      <pre className="text-sm text-red-300 whitespace-pre-wrap break-words font-mono">
                        {streamErrorMessage}
                      </pre>
                    </div>
                  </div>
                )}
                
                {viewerErrorMessage && (
                  <div className="bg-red-900/30 border border-red-500/30 rounded-lg p-4">
                    <h3 className="text-red-400 font-semibold mb-2 flex items-center">
                      <AlertTriangle className="w-5 h-5 mr-2" />
                      Viewer Error
                    </h3>
                    <div className="bg-black/40 rounded-lg p-4 mt-3">
                      <pre className="text-sm text-red-300 whitespace-pre-wrap break-words font-mono">
                        {viewerErrorMessage}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-white/10 flex justify-end shrink-0">
              <button
                onClick={() => setShowErrorModal(false)}
                className="px-6 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition-all duration-200 shadow-lg hover:shadow-amber-500/50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
