import React from 'react'
import { Activity, Zap, Monitor, Clock } from 'lucide-react'

interface StreamStatsProps {
  stats: {
    bitrate: number
    fps: number
    resolution: string
    latency: number
  }
}

const StreamStats: React.FC<StreamStatsProps> = ({ stats }) => {
  return (
    <div className="bg-black/20 backdrop-blur-sm rounded-xl p-6 border border-white/10">
      <h3 className="text-lg font-semibold text-white mb-4">Stream Statistics</h3>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Zap className="w-4 h-4 text-emerald-400" />
            <span className="text-gray-300 text-sm">Bitrate</span>
          </div>
          <span className="text-white font-medium">
            {stats.bitrate > 0 ? `${stats.bitrate} kbps` : '--'}
          </span>
        </div>
        
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            <span className="text-gray-300 text-sm">Frame Rate</span>
          </div>
          <span className="text-white font-medium">
            {stats.fps > 0 ? `${stats.fps} fps` : '--'}
          </span>
        </div>
        
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Monitor className="w-4 h-4 text-emerald-400" />
            <span className="text-gray-300 text-sm">Resolution</span>
          </div>
          <span className="text-white font-medium">
            {stats.resolution || '--'}
          </span>
        </div>
        
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Clock className="w-4 h-4 text-emerald-400" />
            <span className="text-gray-300 text-sm">Latency</span>
          </div>
          <span className="text-white font-medium">
            {stats.latency > 0 ? `${stats.latency}ms` : '--'}
          </span>
        </div>
      </div>
      
      {/* Quality Indicator */}
      <div className="mt-6 pt-4 border-t border-white/10">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-300">Stream Quality</span>
          <span className="text-sm font-medium text-emerald-400">
            {stats.bitrate > 2000 ? 'Excellent' : stats.bitrate > 1000 ? 'Good' : stats.bitrate > 0 ? 'Fair' : 'No Signal'}
          </span>
        </div>
        <div className="w-full bg-gray-700 rounded-full h-2">
          <div 
            className="bg-gradient-to-r from-emerald-500 to-green-400 h-2 rounded-full transition-all duration-300"
            style={{ 
              width: `${Math.min((stats.bitrate / 3000) * 100, 100)}%` 
            }}
          ></div>
        </div>
      </div>
    </div>
  )
}

export default StreamStats
