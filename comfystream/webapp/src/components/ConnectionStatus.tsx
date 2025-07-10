import React from 'react'
import { Wifi, WifiOff, Loader, AlertTriangle } from 'lucide-react'

interface ConnectionStatusProps {
  status: 'disconnected' | 'connecting' | 'connected' | 'error'
}

const ConnectionStatus: React.FC<ConnectionStatusProps> = ({ status }) => {
  const getStatusConfig = () => {
    switch (status) {
      case 'connected':
        return {
          icon: Wifi,
          text: 'Connected',
          color: 'text-emerald-400',
          bgColor: 'bg-emerald-400/10'
        }
      case 'connecting':
        return {
          icon: Loader,
          text: 'Connecting',
          color: 'text-yellow-400',
          bgColor: 'bg-yellow-400/10'
        }
      case 'error':
        return {
          icon: AlertTriangle,
          text: 'Error',
          color: 'text-red-400',
          bgColor: 'bg-red-400/10'
        }
      default:
        return {
          icon: WifiOff,
          text: 'Disconnected',
          color: 'text-gray-400',
          bgColor: 'bg-gray-400/10'
        }
    }
  }

  const config = getStatusConfig()
  const Icon = config.icon

  return (
    <div className={`flex items-center space-x-2 px-3 py-2 rounded-lg ${config.bgColor}`}>
      <Icon className={`w-4 h-4 ${config.color} ${status === 'connecting' ? 'animate-spin' : ''}`} />
      <span className={`text-sm font-medium ${config.color}`}>
        {config.text}
      </span>
    </div>
  )
}

export default ConnectionStatus
