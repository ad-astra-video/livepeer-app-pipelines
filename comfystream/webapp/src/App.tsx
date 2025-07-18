import React, { useState, useRef, useEffect } from 'react'
import { Video, Mic, MicOff, VideoOff, Play, Square, Settings, Radio, Monitor } from 'lucide-react'
import StreamControls from './components/StreamControls'
import ViewerControls from './components/ViewerControls'
import ConnectionStatus from './components/ConnectionStatus'
import StreamStatusSidebar from './components/StreamStatusSidebar'
import TabbedDataView from './components/TabbedDataView'

function App() {
  const [isStreaming, setIsStreaming] = useState(false)
  const [isViewing, setIsViewing] = useState(false)
  const [streamConnectionStatus, setStreamConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected')
  const [viewerConnectionStatus, setViewerConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected')
  const [streamId, setStreamId] = useState<string | null>(null)
  const [streamName, setStreamName] = useState<string | null>(null)
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null)
  const [streamStats, setStreamStats] = useState({
    bitrate: 0,
    fps: 0,
    resolution: '',
    latency: 0,
    streamId: null
  })
  const [isStatusSidebarOpen, setIsStatusSidebarOpen] = useState(false)

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
                <h1 className="text-xl font-bold text-white">WebRTC Streaming</h1>
                <p className="text-sm text-gray-300">WHIP/WHEP Protocol</p>
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
              <button 
                onClick={() => setIsStatusSidebarOpen(true)}
                className="p-2 text-gray-300 hover:text-white transition-colors"
                title="Stream Status"
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
            />
            
            {/* Tabbed Data View Section */}
            <div className="mt-8">
              <TabbedDataView 
                streamName={streamName}
                isStreaming={isStreaming}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Stream Status Sidebar */}
      <StreamStatusSidebar
        isOpen={isStatusSidebarOpen}
        onClose={() => setIsStatusSidebarOpen(false)}
        streamId={streamId}
      />
    </div>
  )
}

export default App
