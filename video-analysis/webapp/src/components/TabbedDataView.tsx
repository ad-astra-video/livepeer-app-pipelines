import React, { useState } from 'react'
import { Activity, Database } from 'lucide-react'
import EventLogs from './EventLogs'
import DataStream from './DataStream'

interface TabbedDataViewProps {
  streamName?: string | null
  isStreaming?: boolean
  latestFrameTimestamp?: number | null
  sourceStreamTimestamp?: number | null
  processingDelay?: number | null
  onDataUpdate?: (timestamp: number | null, delay: number | null) => void
}

const TabbedDataView: React.FC<TabbedDataViewProps> = ({
  streamName,
  isStreaming = false,
  latestFrameTimestamp = null,
  sourceStreamTimestamp = null,
  processingDelay = null,
  onDataUpdate
}) => {
  const [activeTab, setActiveTab] = useState<'events' | 'data'>('events')

  // Debug logging
  console.log('TabbedDataView props:', { 
    streamName, 
    isStreaming, 
    activeTab, 
    latestFrameTimestamp,
    sourceStreamTimestamp,
    processingDelay
  })

  return (
    <div className="bg-black/40 backdrop-blur-sm rounded-xl border border-white/10 overflow-hidden">
      {/* Tab Header */}
      <div className="border-b border-white/10">
        <div className="flex items-center justify-between">
          <div className="flex">
            <button
              onClick={() => setActiveTab('events')}
              className={`flex items-center space-x-2 px-6 py-4 text-sm font-medium transition-colors ${
                activeTab === 'events'
                  ? 'text-white bg-purple-600/20 border-b-2 border-purple-500'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Activity className="w-4 h-4" />
              <span>Event Logs</span>
            </button>
            
            <button
              onClick={() => setActiveTab('data')}
              className={`flex items-center space-x-2 px-6 py-4 text-sm font-medium transition-colors ${
                activeTab === 'data'
                  ? 'text-white bg-blue-600/20 border-b-2 border-blue-500'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Database className="w-4 h-4" />
              <span>Data Stream</span>
            </button>
          </div>
          
          {/* Timestamp Display */}
          <div className="px-6 py-4">
            <div className="flex space-x-4 text-xs">
              {sourceStreamTimestamp !== null && (
                <div className="text-gray-400">
                  Source: 
                  <span className="ml-2 font-mono text-green-400">
                    {sourceStreamTimestamp.toFixed(3)}s
                  </span>
                </div>
              )}
              
              {latestFrameTimestamp !== null && (
                <div className="text-gray-400">
                  Processed: 
                  <span className="ml-2 font-mono text-blue-400">
                    {latestFrameTimestamp.toFixed(3)}s
                  </span>
                </div>
              )}
              
              {processingDelay !== null && (
                <div className="text-gray-400">
                  Delay: 
                  <span className="ml-2 font-mono text-yellow-400">
                    {processingDelay}s
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <div className="relative">
        <div className={`${activeTab === 'events' ? 'block' : 'hidden'} p-0`}>
          <EventLogs />
        </div>
        
        {/* Data Stream */}
        <div style={{ display: activeTab === 'data' ? 'block' : 'none' }} className="p-0">
          <DataStream 
            streamName={streamName}
            isStreaming={isStreaming}
            onTimestampUpdate={(timestamp, delay) => {
              if (onDataUpdate) {
                onDataUpdate(timestamp, delay);
              }
            }}
          />
        </div>
      </div>
    </div>
  )
}

export default TabbedDataView
