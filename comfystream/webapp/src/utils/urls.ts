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

// Get default WHEP endpoint URL  
export const getDefaultWhepUrl = (): string => {
  return `http://localhost:8890`
}

// Get stream status URL
export const getStreamStatusUrl = (streamId: string): string => {
  return `${getBaseUrl()}/gateway/process/stream/status/${streamId}`
}

// Get ICE restart endpoint URL base (whip/whep and stream ID will be appended)
export const getIceRestartEndpointBase = (): string => {
  return `${getBaseUrl()}/gateway/process/stream`
}
