import React from 'react'
import { Activity, Settings, Wifi, WifiOff } from 'lucide-react'

interface StreamStatusIndicatorProps {
  streamId: string | null
  isStreaming: boolean
  onClick: () => void
  onOpenSettings: () => void
}

const StreamStatusIndicator: React.FC<StreamStatusIndicatorProps> = ({
  streamId,
  isStreaming,
  onClick,
  onOpenSettings
}) => {
  const handleClick = () => {
    // If we have an active stream with streamId, show stream status
    if (isStreaming && streamId) {
      onClick()
    } else {
      // Otherwise show settings modal
      onOpenSettings()
    }
  }
  const getStatusIcon = () => {
    if (isStreaming && streamId) {
      return <Activity className="w-5 h-5 text-green-400" />
    } else if (isStreaming && !streamId) {
      return <Wifi className="w-5 h-5 text-yellow-400" />
    } else {
      return <Settings className="w-5 h-5 text-gray-400" />
    }
  }

  const getStatusColor = () => {
    if (isStreaming && streamId) {
      return 'text-green-400 hover:text-green-300'
    } else if (isStreaming && !streamId) {
      return 'text-yellow-400 hover:text-yellow-300'
    } else {
      return 'text-gray-400 hover:text-white'
    }
  }

  const getStatusTitle = () => {
    if (isStreaming && streamId) {
      return `Stream Status - Active (ID: ${streamId})`
    } else if (isStreaming && !streamId) {
      return 'Settings - Configure URL defaults'
    } else {
      return 'Settings - Configure URL defaults'
    }
  }

  return (
    <button 
      onClick={handleClick}
      className={`p-2 transition-colors ${getStatusColor()}`}
      title={getStatusTitle()}
    >
      {getStatusIcon()}
    </button>
  )
}

export default StreamStatusIndicator
