// Utility function to get the base URL from the current window location
export const getBaseUrl = (): string => {
  // Get the current window location
  const { protocol, hostname, port } = window.location
  
  // Construct the base URL
  let baseUrl = `${protocol}//${hostname}`
  
  // Add port if it's not the default port for the protocol
  if (port && 
      !((protocol === 'https:' && port === '443') || 
        (protocol === 'http:' && port === '80'))) {
    baseUrl += `:${port}`
  }
  
  return baseUrl
}

// Get default WHIP endpoint URL
export const getDefaultWhipUrl = (): string => {
  return `http://localhost:5937/live/video-to-video`
}

// Get WHIP URL with streamId
export const getWhipUrlWithStreamId = (baseUrl: string, streamId: string): string => {
  const url = new URL(baseUrl)
  url.searchParams.set('streamId', streamId)
  return url.toString()
}

// Generate a random stream ID
export const generateStreamId = (): string => {
  return `stream-${Math.random().toString(36).substring(2, 8)}-${Date.now().toString(36)}`
}

// Get default WHEP endpoint URL  
export const getDefaultWhepUrl = (): string => {
  return `http://localhost:8890`
}

// Get stream status URL
export const getStreamStatusUrl = (streamId: string): string => {
  return `http://localhost:5937/live/video-to-video/${streamId}/status`
}

// Get default data stream URL
export const getDefaultDataStreamUrl = (): string => {
  return `http://localhost:5937`
}

// Get default Kafka events URL
export const getDefaultKafkaEventsUrl = (): string => {
  return `http://localhost:7114`
}
