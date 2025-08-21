import React, { useState, useRef, useEffect } from 'react'
import { Database, Play, Square, Server, MessageSquare, X, Download, RefreshCw, ChevronRight } from 'lucide-react'
import { loadSettingsFromStorage } from './SettingsModal'

interface DataLog {
  id: string
  timestamp: number
  type: string
  data: any
  expanded?: boolean
}

interface DataStreamProps {
  streamName?: string | null
  isStreaming?: boolean
  autoStart?: boolean
  maxLogs?: number
  onTimestampUpdate?: (timestamp: number | null, delaySeconds: number | null) => void
}

const DataStream: React.FC<DataStreamProps> = ({
  streamName,
  isStreaming = false,
  autoStart = false,
  maxLogs = 1000,
  onTimestampUpdate
}) => {
  const [dataUrl, setDataUrl] = useState(() => {
    const savedSettings = loadSettingsFromStorage()
    return savedSettings.dataStreamUrl
  })
  const [isConnected, setIsConnected] = useState(false)
  const [logs, setLogs] = useState<DataLog[]>([])
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected')
  const [autoScroll, setAutoScroll] = useState(true)
  const [filterText, setFilterText] = useState('')
  const [manuallyDisconnected, setManuallyDisconnected] = useState(false)
  
  const logsContainerRef = useRef<HTMLDivElement>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const logCounterRef = useRef(0)

  // Auto-connect when streaming starts (but not if manually disconnected)
  useEffect(() => {
    console.log('DataStream useEffect:', { isStreaming, streamName, isConnected, manuallyDisconnected })
    if (isStreaming && streamName && !isConnected && !manuallyDisconnected) {
      console.log('Auto-connecting to data stream...')
      connectToDataStream()
    } else if (!isStreaming && isConnected) {
      console.log('Auto-disconnecting from data stream...')
      disconnectFromDataStream()
    }
  }, [isStreaming, streamName, isConnected, manuallyDisconnected])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
    }
  }, [])

  // Listen for storage changes to update URL from settings
  useEffect(() => {
    const handleStorageChange = () => {
      const savedSettings = loadSettingsFromStorage()
      setDataUrl(savedSettings.dataStreamUrl)
    }
    
    const handleSettingsChange = (event: CustomEvent) => {
      if (event.detail?.dataStreamUrl) {
        setDataUrl(event.detail.dataStreamUrl)
      }
    }
    
    window.addEventListener('storage', handleStorageChange)
    window.addEventListener('live-settings-changed', handleSettingsChange as EventListener)
    
    return () => {
      window.removeEventListener('storage', handleStorageChange)
      window.removeEventListener('live-settings-changed', handleSettingsChange as EventListener)
    }
  }, [])

  useEffect(() => {
    if (autoScroll && logsContainerRef.current) {
      // Always scroll to bottom to show latest events
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight
    }
  }, [logs, autoScroll])

  const connectToDataStream = async () => {
    if (isConnected || connectionStatus === 'connecting') return

    if (!streamName) {
      console.warn('No stream name available for data connection')
      return
    }

    try {
      setConnectionStatus('connecting')
      setManuallyDisconnected(false) // Reset manual disconnect flag
      
      // Create SSE connection to data stream endpoint
      const sseUrl = `${dataUrl}/live/video-to-video/${streamName}/data`
      console.log(`Connecting to data stream: ${sseUrl}`)
      
      const eventSource = new EventSource(sseUrl)
      eventSourceRef.current = eventSource

      // Debug: Log all properties of the EventSource
      console.log('EventSource created:', {
        url: eventSource.url,
        readyState: eventSource.readyState,
        withCredentials: eventSource.withCredentials
      })

      eventSource.onopen = () => {
        console.log('Connected to Data Stream')
        console.log('EventSource readyState:', eventSource.readyState)
        console.log('EventSource url:', eventSource.url)
        setIsConnected(true)
        setConnectionStatus('connected')
      }

      eventSource.onmessage = (event) => {
        console.log('Data stream message received:', event.data)
        try {
          const data = JSON.parse(event.data.trim())
          console.log('Parsed data:', data)
          
          // Extract frame timestamp and delay from worker data
          if (data.timestamp_seconds !== undefined && onTimestampUpdate) {
            const delaySeconds = data.delay_seconds !== undefined ? data.delay_seconds : null
            onTimestampUpdate(data.timestamp_seconds, delaySeconds)
          }
          
          // Parse timestamp - handle both string and number formats
          let parsedTimestamp = Date.now()
          if (data.timestamp) {
            if (typeof data.timestamp === 'string') {
              parsedTimestamp = parseInt(data.timestamp, 10)
            } else if (typeof data.timestamp === 'number') {
              parsedTimestamp = data.timestamp
            }
          }
          
          const log: DataLog = {
            id: `data-${logCounterRef.current++}`,
            timestamp: parsedTimestamp,
            type: data.type || 'data',
            data: data,
            expanded: true
          }
          
          setLogs(prevLogs => {
            const newLogs = [...prevLogs, log]
            console.log('Updated logs count:', newLogs.length)
            // Keep only the last maxLogs entries
            return newLogs.slice(-maxLogs)
          })
        } catch (error) {
          console.error('Error parsing data stream message:', error)
          
          // Create a log entry even if parsing fails
          const log: DataLog = {
            id: `data-${logCounterRef.current++}`,
            timestamp: Date.now(),
            type: 'raw',
            data: { raw: event.data, error: error.message },
            expanded: true
          }
          
          setLogs(prevLogs => {
            const newLogs = [...prevLogs, log]
            return newLogs.slice(-maxLogs)
          })
        }
      }

      eventSource.onerror = (error) => {
        console.error('Data Stream SSE error:', error)
        console.error('SSE readyState:', eventSource.readyState)
        setIsConnected(false)
        setConnectionStatus('error')
        if (onTimestampUpdate) {
          onTimestampUpdate(null, null)
        }
        if (eventSourceRef.current) {
          eventSourceRef.current.close()
          eventSourceRef.current = null
        }
      }

    } catch (error) {
      console.error('Error connecting to Data Stream:', error)
      setConnectionStatus('error')
    }
  }

  const disconnectFromDataStream = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    setIsConnected(false)
    setConnectionStatus('disconnected')
    setManuallyDisconnected(true) // Mark as manually disconnected
    if (onTimestampUpdate) {
      onTimestampUpdate(null, null)
    }
  }

  const clearLogs = () => {
    setLogs([])
    logCounterRef.current = 0
  }

  const toggleLogExpansion = (logId: string) => {
    setLogs(prevLogs => 
      prevLogs.map(log => 
        log.id === logId 
          ? { ...log, expanded: !log.expanded }
          : log
      )
    )
  }

  const expandAllLogs = () => {
    setLogs(prevLogs => prevLogs.map(log => ({ ...log, expanded: true })))
  }

  const collapseAllLogs = () => {
    setLogs(prevLogs => prevLogs.map(log => ({ ...log, expanded: false })))
  }

  const exportLogs = () => {
    const logsData = JSON.stringify(logs, null, 2)
    const blob = new Blob([logsData], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `data-stream-${streamName}-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const filteredLogs = logs.filter(log => {
    if (!filterText) return true
    const searchText = filterText.toLowerCase()
    return (
      log.type.toLowerCase().includes(searchText) ||
      JSON.stringify(log.data).toLowerCase().includes(searchText)
    )
  })

  const formatTimestamp = (timestamp: number) => {
    try {
      if (!timestamp || isNaN(timestamp)) {
        return new Date().toLocaleTimeString()
      }
      
      const date = new Date(timestamp)
      
      if (isNaN(date.getTime())) {
        return new Date().toLocaleTimeString()
      }
      
      return date.toLocaleTimeString()
    } catch (error) {
      console.error('Error formatting timestamp:', error)
      return new Date().toLocaleTimeString()
    }
  }

  const formatValue = (value: any) => {
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value)
        return JSON.stringify(parsed, null, 2)
      } catch {
        return value
      }
    }
    return JSON.stringify(value, null, 2)
  }

  return (
    <div className="h-full">
      <div className="p-6 border-b border-white/10">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center">
              <Database className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Data Stream</h2>
              <p className="text-sm text-gray-300">
                {streamName ? `Stream: ${streamName}` : 'Real-time data from video processing'}
              </p>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <div className={`px-3 py-1 rounded-full text-xs font-medium ${
              connectionStatus === 'connected' ? 'bg-green-600 text-white' :
              connectionStatus === 'connecting' ? 'bg-yellow-600 text-white' :
              connectionStatus === 'error' ? 'bg-red-600 text-white' :
              'bg-gray-600 text-white'
            }`}>
              {connectionStatus === 'connected' && <span className="flex items-center"><Server className="w-3 h-3 mr-1" />Connected</span>}
              {connectionStatus === 'connecting' && <span className="flex items-center"><RefreshCw className="w-3 h-3 mr-1 animate-spin" />Connecting</span>}
              {connectionStatus === 'error' && <span>Error</span>}
              {connectionStatus === 'disconnected' && <span>Disconnected</span>}
            </div>
            
            <button
              onClick={isConnected ? disconnectFromDataStream : connectToDataStream}
              disabled={connectionStatus === 'connecting' || !streamName}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                isConnected
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-green-600 hover:bg-green-700 text-white disabled:bg-gray-600 disabled:cursor-not-allowed'
              }`}
            >
              {isConnected ? (
                <>
                  <Square className="w-4 h-4" />
                  <span>Disconnect</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  <span>Connect</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Configuration Inputs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Data Stream Base URL
            </label>
            <input
              type="text"
              value={dataUrl}
              onChange={(e) => setDataUrl(e.target.value)}
              placeholder="http://localhost:7114"
              className="w-full px-4 py-2 bg-black/20 border border-white/10 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={isConnected}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Stream Name
            </label>
            <input
              type="text"
              value={streamName || ''}
              placeholder="Stream name from video session"
              className="w-full px-4 py-2 bg-black/20 border border-white/10 rounded-lg text-gray-400 placeholder-gray-500 cursor-not-allowed"
              disabled={true}
            />
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                placeholder="Filter data..."
                className="px-3 py-1 bg-black/20 border border-white/10 rounded text-white placeholder-gray-400 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              {filterText && (
                <button
                  onClick={() => setFilterText('')}
                  className="p-1 text-gray-400 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            
            <label className="flex items-center space-x-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
                className="rounded bg-black/20 border-white/10 text-blue-600 focus:ring-blue-500"
              />
              <span>Auto-scroll</span>
            </label>
          </div>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={expandAllLogs}
              disabled={logs.length === 0}
              className="px-3 py-1 text-xs bg-blue-600/20 text-blue-300 rounded hover:bg-blue-600/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Expand all logs"
            >
              Expand All
            </button>
            
            <button
              onClick={collapseAllLogs}
              disabled={logs.length === 0}
              className="px-3 py-1 text-xs bg-gray-600/20 text-gray-300 rounded hover:bg-gray-600/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Collapse all logs"
            >
              Collapse All
            </button>
            
            <span className="text-sm text-gray-400">
              {filteredLogs.length} of {logs.length} entries
            </span>
            
            <button
              onClick={exportLogs}
              disabled={logs.length === 0}
              className="p-2 text-gray-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Export data as JSON"
            >
              <Download className="w-4 h-4" />
            </button>
            
            <button
              onClick={clearLogs}
              disabled={logs.length === 0}
              className="p-2 text-gray-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Clear all data"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Logs Display */}
      <div className="h-96 overflow-hidden">
        <div 
          ref={logsContainerRef}
          className="h-full overflow-y-auto p-4 space-y-2"
        >
          {filteredLogs.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-400">
              <div className="text-center">
                <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium mb-2">No data available</p>
                <p className="text-sm">
                  {!streamName 
                    ? 'Start streaming to enable data connection'
                    : !isConnected 
                      ? 'Connect to start receiving data stream'
                      : filterText 
                        ? 'No data matches your filter'
                        : 'Waiting for data messages...'
                  }
                </p>
              </div>
            </div>
          ) : (
            filteredLogs.map((log) => (
              <div key={log.id} className="bg-black/30 border border-white/5 rounded-lg overflow-hidden">
                <div 
                  className="p-3 cursor-pointer hover:bg-black/40 transition-colors"
                  onClick={() => toggleLogExpansion(log.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="flex items-center space-x-2">
                        <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${
                          log.expanded ? 'rotate-90' : ''
                        }`} />
                        <span className="text-sm font-medium text-white">
                          {log.type}
                        </span>
                      </div>
                      <span className="text-xs text-gray-400 font-mono">
                        {formatTimestamp(log.timestamp)}
                      </span>
                      <span className="px-2 py-1 bg-blue-600/20 text-blue-300 rounded text-xs">
                        data
                      </span>
                    </div>
                    <div className="text-xs text-gray-500">
                      {log.expanded ? 'Click to collapse' : 'Click to expand'}
                    </div>
                  </div>
                </div>
                
                {log.expanded && (
                  <div className="px-3 pb-3">
                    <div className="bg-black/50 rounded p-3 overflow-x-auto">
                      <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono">
                        {formatValue(log.data)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export default DataStream
