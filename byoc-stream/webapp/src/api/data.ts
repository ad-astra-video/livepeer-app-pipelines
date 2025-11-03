/**
 * Data Stream API functions
 * Handles real-time data stream connections via Server-Sent Events (SSE)
 */

export interface DataStreamConfig {
  streamName: string
  dataUrlFromStart: string | null
}

export interface DataStreamCallbacks {
  onOpen?: () => void
  onMessage?: (data: any) => void
  onError?: (error: Event) => void
  onClose?: () => void
}

/**
 * Connects to a data stream using Server-Sent Events (SSE)
 */
export const connectToDataStream = async (
  config: DataStreamConfig,
  callbacks: DataStreamCallbacks = {}
): Promise<EventSource> => {
  const { streamName, dataUrlFromStart } = config
  const { onOpen, onMessage, onError, onClose } = callbacks

  if (!streamName) {
    throw new Error('No stream name available for data connection')
  }

  if (!dataUrlFromStart) {
    throw new Error('No data URL from stream start available for connection')
  }

  // Use data_url directly from start response
  const sseUrl = dataUrlFromStart
  console.log(`Using data URL from stream start response: ${sseUrl}`)
  
  console.log(`Connecting to data stream: ${sseUrl}`)
  
  const eventSource = new EventSource(sseUrl)

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
    onOpen?.()
  }

  eventSource.onmessage = (event) => {
    console.log('Data stream message received:', event.data)
    try {
      const data = JSON.parse(event.data.trim())
      console.log('Parsed data:', data)
      onMessage?.(data)
    } catch (error) {
      console.error('Error parsing data stream message:', error)
      // Call onMessage with raw data and error info
      onMessage?.({ 
        raw: event.data, 
        error: error instanceof Error ? error.message : String(error),
        _parseError: true
      })
    }
  }

  eventSource.onerror = (error) => {
    console.error('Data Stream SSE error:', error)
    console.error('SSE readyState:', eventSource.readyState)
    onError?.(error)
  }

  // Handle close if provided
  if (onClose) {
    eventSource.addEventListener('close', onClose)
  }

  return eventSource
}

/**
 * Disconnects from a data stream
 */
export const disconnectFromDataStream = (eventSource: EventSource | null): void => {
  if (eventSource) {
    eventSource.close()
    console.log('Disconnected from data stream')
  }
}