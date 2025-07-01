import React, { useState, useRef, useEffect } from 'react'
import { Video, Mic, MicOff, VideoOff, Play, Square, Settings, Radio, Monitor } from 'lucide-react'
import StreamControls from './components/StreamControls'
import ViewerControls from './components/ViewerControls'
import ConnectionStatus from './components/ConnectionStatus'
import StreamStats from './components/StreamStats'

function App() {
  const [activeTab, setActiveTab] = useState<'publish' | 'view'>('publish')
  const [isStreaming, setIsStreaming] = useState(false)
  const [isViewing, setIsViewing] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected')
  const [streamId, setStreamId] = useState<string | null>(null)
  const [streamStats, setStreamStats] = useState({
    bitrate: 0,
    fps: 0,
    resolution: '',
    latency: 0
  })

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
              <ConnectionStatus status={connectionStatus} />
              <button className="p-2 text-gray-300 hover:text-white transition-colors">
                <Settings className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tab Navigation */}
        <div className="flex space-x-1 bg-black/20 backdrop-blur-sm rounded-lg p-1 mb-8 max-w-md mx-auto">
          <button
            onClick={() => setActiveTab('publish')}
            className={`flex-1 flex items-center justify-center space-x-2 py-3 px-4 rounded-md transition-all ${
              activeTab === 'publish'
                ? 'bg-emerald-600 text-white shadow-lg'
                : 'text-gray-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <Video className="w-4 h-4" />
            <span className="font-medium">Publish Stream</span>
          </button>
          <button
            onClick={() => setActiveTab('view')}
            className={`flex-1 flex items-center justify-center space-x-2 py-3 px-4 rounded-md transition-all ${
              activeTab === 'view'
                ? 'bg-emerald-600 text-white shadow-lg'
                : 'text-gray-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <Monitor className="w-4 h-4" />
            <span className="font-medium">View Stream</span>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2">
            {activeTab === 'publish' ? (
              <StreamControls
                isStreaming={isStreaming}
                setIsStreaming={setIsStreaming}
                setConnectionStatus={setConnectionStatus}
                setStreamStats={setStreamStats}
                setStreamId={setStreamId}
              />
            ) : (
              <ViewerControls
                isViewing={isViewing}
                setIsViewing={setIsViewing}
                setConnectionStatus={setConnectionStatus}
                setStreamStats={setStreamStats}
                streamId={streamId}
              />
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <StreamStats stats={streamStats} />
            
            {/* Quick Actions */}
            <div className="bg-black/20 backdrop-blur-sm rounded-xl p-6 border border-white/10">
              <h3 className="text-lg font-semibold text-white mb-4">Quick Actions</h3>
              <div className="space-y-3">
                <button className="w-full flex items-center space-x-3 p-3 bg-white/5 hover:bg-emerald-500/10 hover:border-emerald-500/20 border border-transparent rounded-lg transition-colors text-left">
                  <Settings className="w-5 h-5 text-gray-300" />
                  <span className="text-gray-300">Stream Settings</span>
                </button>
                <button className="w-full flex items-center space-x-3 p-3 bg-white/5 hover:bg-emerald-500/10 hover:border-emerald-500/20 border border-transparent rounded-lg transition-colors text-left">
                  <Monitor className="w-5 h-5 text-gray-300" />
                  <span className="text-gray-300">Display Settings</span>
                </button>
              </div>
            </div>

            {/* Protocol Info */}
            <div className="bg-black/20 backdrop-blur-sm rounded-xl p-6 border border-white/10">
              <h3 className="text-lg font-semibold text-white mb-4">Protocol Info</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-300">WHIP Version:</span>
                  <span className="text-white">1.0</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-300">WHEP Version:</span>
                  <span className="text-white">1.0</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-300">WebRTC:</span>
                  <span className="text-emerald-400">Enabled</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
