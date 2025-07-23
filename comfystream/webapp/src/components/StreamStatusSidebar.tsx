import React, { useState, useEffect } from 'react'
import { X, RefreshCw } from 'lucide-react'
import { getBaseUrl, getStreamStatusUrl } from '../utils/urls'

interface StreamStatusSidebarProps {
  isOpen: boolean
  onClose: () => void
  streamId?: string | null
}

const StreamStatusSidebar: React.FC<StreamStatusSidebarProps> = ({ isOpen, onClose, streamId }) => {
  const [statusData, setStatusData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchStatus = async () => {
    try {
      setLoading(true)
      setError(null)
      
      let endpoint = `${getBaseUrl()}/status`
      if (streamId) {
        endpoint = getStreamStatusUrl(streamId)
      }
      
      const response = await fetch(endpoint)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const data = await response.json()
      setStatusData(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch status')
      setStatusData(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      fetchStatus()
      // Auto-refresh every 5 seconds when sidebar is open
      const interval = setInterval(fetchStatus, 5000)
      return () => clearInterval(interval)
    }
  }, [isOpen, streamId])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onClose}
      />
      
      {/* Sidebar */}
      <div className="absolute right-0 top-0 h-full w-96 bg-slate-800 shadow-xl transform transition-transform">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-white">
            {streamId ? `Stream Status: ${streamId}` : 'System Status'}
          </h2>
          <div className="flex items-center space-x-2">
            <button
              onClick={fetchStatus}
              disabled={loading}
              className="p-1 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-white transition-colors"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 h-full overflow-y-auto">
          {loading && !statusData && (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
              <span className="ml-2 text-gray-400">Loading...</span>
            </div>
          )}

          {error && (
            <div className="bg-red-900/50 border border-red-700 rounded-lg p-4 mb-4">
              <h3 className="text-red-400 font-semibold mb-2">Error</h3>
              <p className="text-red-300 text-sm">{error}</p>
            </div>
          )}

          {statusData && (
            <div className="space-y-4">
              <div className="bg-slate-700 rounded-lg p-4">
                <h3 className="text-white font-semibold mb-3">Status Data</h3>
                <pre className="text-xs text-gray-300 overflow-x-auto whitespace-pre-wrap">
                  {JSON.stringify(statusData, null, 2)}
                </pre>
              </div>
            </div>
          )}

          {!loading && !error && !statusData && (
            <div className="text-center py-8">
              <p className="text-gray-400">No status data available</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default StreamStatusSidebar