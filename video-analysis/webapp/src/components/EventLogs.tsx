import React, { useState, useRef, useEffect } from 'react'
import { Activity, Play, Square, Server, MessageSquare, X, Download, RefreshCw, ChevronRight } from 'lucide-react'
import { loadSettingsFromStorage } from './SettingsModal'

interface KafkaLog {
  id: string
  timestamp: number
  type: string
  topic: string
  partition: number
  offset: number
  key: string | null
  value: any
  headers?: Record<string, string>
  expanded?: boolean
}

interface EventLogsProps {
  // Optional props for external control
  autoStart?: boolean
  maxLogs?: number
}

const EventLogs: React.FC<EventLogsProps> = ({
  autoStart = true,
  maxLogs = 1000
}) => {
  const [kafkaUrl, setKafkaUrl] = useState(() => {
    const savedSettings = loadSettingsFromStorage()
    return savedSettings.kafkaEventsUrl
  })
  const [topic, setTopic] = useState('streaming-events')
  const [isConnected, setIsConnected] = useState(false)
  const [logs, setLogs] = useState<KafkaLog[]>([])
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected')
  const [autoScroll, setAutoScroll] = useState(true)
  const [filterText, setFilterText] = useState('')
  
  const logsContainerRef = useRef<HTMLDivElement>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const logCounterRef = useRef(0)

  useEffect(() => {
    // Auto-connect when component mounts
    connectToKafka()
    
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
    }
  }, []) // Remove autoStart dependency since we always want to connect

  useEffect(() => {
    if (autoScroll && logsContainerRef.current) {
      // Check if any log is expanded - if so, don't auto-scroll
      const hasExpandedLogs = logs.some(log => log.expanded)
      if (!hasExpandedLogs) {
        logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight
      }
    }
  }, [logs, autoScroll])

  // Listen for storage changes to update URL from settings
  useEffect(() => {
    const handleStorageChange = () => {
      const savedSettings = loadSettingsFromStorage()
      setKafkaUrl(savedSettings.kafkaEventsUrl)
    }
    
    const handleSettingsChange = (event: CustomEvent) => {
      if (event.detail?.kafkaEventsUrl) {
        setKafkaUrl(event.detail.kafkaEventsUrl)
      }
    }
    
    window.addEventListener('storage', handleStorageChange)
    window.addEventListener('live-settings-changed', handleSettingsChange as EventListener)
    
    return () => {
      window.removeEventListener('storage', handleStorageChange)
      window.removeEventListener('live-settings-changed', handleSettingsChange as EventListener)
    }
  }, [])

  const connectToKafka = async () => {
    if (isConnected || connectionStatus === 'connecting') return

    try {
      setConnectionStatus('connecting')
      
      // Create SSE connection to Kafka events endpoint
      const sseUrl = `${kafkaUrl}/events`
      const eventSource = new EventSource(sseUrl)
      eventSourceRef.current = eventSource

      eventSource.onopen = () => {
        console.log('Connected to Event Logs SSE stream')
        setIsConnected(true)
        setConnectionStatus('connected')
      }

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          
          // Parse timestamp - handle both string and number formats
          let parsedTimestamp = Date.now()
          if (data.timestamp) {
            if (typeof data.timestamp === 'string') {
              parsedTimestamp = parseInt(data.timestamp, 10)
            } else if (typeof data.timestamp === 'number') {
              parsedTimestamp = data.timestamp
            }
          }
          
          const log: KafkaLog = {
            id: `log-${logCounterRef.current++}`,
            timestamp: parsedTimestamp,
            type: data.type || 'unknown',
            topic: data.topic || topic,
            partition: data.partition || 0,
            offset: data.offset || 0,
            key: data.key,
            value: data,
            headers: data.headers,
            expanded: false
          }
          
          setLogs(prevLogs => {
            const newLogs = [...prevLogs, log]
            // Keep only the last maxLogs entries
            return newLogs.slice(-maxLogs)
          })
        } catch (error) {
          console.error('Error parsing SSE message:', error)
        }
      }

      eventSource.onerror = (error) => {
        console.error('Event Logs SSE error:', error)
        setIsConnected(false)
        setConnectionStatus('error')
        if (eventSourceRef.current) {
          eventSourceRef.current.close()
          eventSourceRef.current = null
        }
      }

    } catch (error) {
      console.error('Error connecting to Event Logs SSE:', error)
      setConnectionStatus('error')
    }
  }

  const disconnectFromKafka = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    setIsConnected(false)
    setConnectionStatus('disconnected')
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
    a.download = `event-logs-${topic}-${new Date().toISOString().split('T')[0]}.json`
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
      log.topic.toLowerCase().includes(searchText) ||
      (log.key && log.key.toLowerCase().includes(searchText)) ||
      JSON.stringify(log.value).toLowerCase().includes(searchText)
    )
  })

  const formatTimestamp = (timestamp: number) => {
    try {
      // Validate timestamp - if it's not a valid number or date, use current time
      if (!timestamp || isNaN(timestamp)) {
        return new Date().toLocaleTimeString()
      }
      
      const date = new Date(timestamp)
      
      // Check if the date is valid
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
        // Try to parse as JSON for better formatting
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
            <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
              <Activity className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Event Logs</h2>
              <p className="text-sm text-gray-300">Real-time streaming events</p>
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
              onClick={isConnected ? disconnectFromKafka : connectToKafka}
              disabled={connectionStatus === 'connecting'}
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
              Kafka SSE Events URL
            </label>
            <input
              type="text"
              value={kafkaUrl}
              onChange={(e) => setKafkaUrl(e.target.value)}
              placeholder="localhost:7114"
              className="w-full px-4 py-2 bg-black/20 border border-white/10 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              disabled={isConnected}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Topic
            </label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="streaming-events"
              className="w-full px-4 py-2 bg-black/20 border border-white/10 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              disabled={isConnected}
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
                placeholder="Filter logs..."
                className="px-3 py-1 bg-black/20 border border-white/10 rounded text-white placeholder-gray-400 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500"
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
                className="rounded bg-black/20 border-white/10 text-purple-600 focus:ring-purple-500"
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
              {filteredLogs.length} of {logs.length} logs
            </span>
            
            <button
              onClick={exportLogs}
              disabled={logs.length === 0}
              className="p-2 text-gray-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Export logs as JSON"
            >
              <Download className="w-4 h-4" />
            </button>
            
            <button
              onClick={clearLogs}
              disabled={logs.length === 0}
              className="p-2 text-gray-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Clear all logs"
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
                <p className="text-lg font-medium mb-2">No logs available</p>
                <p className="text-sm">
                  {!isConnected 
                    ? 'Connect to start receiving event logs'
                    : filterText 
                      ? 'No logs match your filter'
                      : 'Waiting for log messages...'
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
                      <span className="px-2 py-1 bg-purple-600/20 text-purple-300 rounded text-xs">
                        {log.topic}:{log.partition}@{log.offset}
                      </span>
                      {log.key && (
                        <span className="px-2 py-1 bg-blue-600/20 text-blue-300 rounded text-xs font-mono">
                          {log.key}
                        </span>
                      )}
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
                        {formatValue(log.value)}
                      </pre>
                    </div>
                    
                    {log.headers && Object.keys(log.headers).length > 0 && (
                      <div className="mt-2 text-xs">
                        <span className="text-gray-400">Headers:</span>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {Object.entries(log.headers).map(([key, value]) => (
                            <span key={key} className="px-2 py-1 bg-gray-600/20 text-gray-300 rounded text-xs">
                              {key}: {value}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
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

export default EventLogs
