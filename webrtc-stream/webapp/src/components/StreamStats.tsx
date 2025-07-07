import React from 'react'
import { Activity, Zap, Monitor, Clock } from 'lucide-react'

interface StreamStatsProps {
  stats: {
    bitrate: number
    fps: number
    resolution: string
    latency: number
    streamId?: string | null
  }
}

const StreamStats: React.FC<StreamStatsProps> = ({ stats }) => {
  return (
    <div className="bg-black/20 backdrop-blur-sm rounded-xl p-6 border border-white/10">
      <h3 className="text-lg font-semibold text-white mb-6">Stream Statistics</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
        <div className="flex items-center justify-between lg:justify-start lg:flex-col lg:items-start">
          <div className="flex items-center space-x-2 lg:mb-2">
            <Zap className="w-4 h-4 text-emerald-400" />
            <span className="text-gray-300 text-sm">Bitrate</span>
          </div>
          <span className="text-white font-medium text-lg">
            {stats.bitrate > 0 ? `${stats.bitrate} kbps` : '--'}
          </span>
        </div>
        
        <div className="flex items-center justify-between lg:justify-start lg:flex-col lg:items-start">
          <div className="flex items-center space-x-2 lg:mb-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            <span className="text-gray-300 text-sm">Frame Rate</span>
          </div>
          <span className="text-white font-medium text-lg">
            {stats.fps > 0 ? `${stats.fps} fps` : '--'}
          </span>
        </div>
        
        <div className="flex items-center justify-between lg:justify-start lg:flex-col lg:items-start">
          <div className="flex items-center space-x-2 lg:mb-2">
            <Monitor className="w-4 h-4 text-emerald-400" />
            <span className="text-gray-300 text-sm">Resolution</span>
          </div>
          <span className="text-white font-medium text-lg">
            {stats.resolution || '--'}
          </span>
        </div>
        
        <div className="flex items-center justify-between lg:justify-start lg:flex-col lg:items-start">
          <div className="flex items-center space-x-2 lg:mb-2">
            <Clock className="w-4 h-4 text-emerald-400" />
            <span className="text-gray-300 text-sm">Latency</span>
          </div>
          <span className="text-white font-medium text-lg">
            {stats.latency > 0 ? `${stats.latency}ms` : '--'}
          </span>
        </div>
      </div>
      
      {/* Stream ID display */}
      {stats.streamId && (
        <div className="mt-6 pt-4 border-t border-white/10">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-300">Stream ID</span>
            <span className="text-sm font-medium text-white truncate max-w-[300px]" title={stats.streamId}>
              {stats.streamId}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

export default StreamStats
