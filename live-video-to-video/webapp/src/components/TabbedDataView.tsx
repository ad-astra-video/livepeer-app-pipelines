import React, { useState } from 'react'
import { Activity, Database } from 'lucide-react'
import EventLogs from './EventLogs'
import DataStream from './DataStream'

interface TabbedDataViewProps {
  streamName?: string | null
  isStreaming?: boolean
}

const TabbedDataView: React.FC<TabbedDataViewProps> = ({
  streamName,
  isStreaming = false
}) => {
  const [activeTab, setActiveTab] = useState<'events' | 'data'>('events')

  // Debug logging
  console.log('TabbedDataView props:', { streamName, isStreaming, activeTab })

  return (
    <div className="bg-black/40 backdrop-blur-sm rounded-xl border border-white/10 overflow-hidden">
      {/* Tab Header */}
      <div className="border-b border-white/10">
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
      </div>

      {/* Tab Content */}
      <div className="relative">
        <div className={`${activeTab === 'events' ? 'block' : 'hidden'} p-0`}>
          <EventLogs />
        </div>
        
        <div className={`${activeTab === 'data' ? 'block' : 'hidden'} p-0`}>
          <DataStream 
            streamName={streamName}
            isStreaming={isStreaming}
          />
        </div>
      </div>
    </div>
  )
}

export default TabbedDataView
