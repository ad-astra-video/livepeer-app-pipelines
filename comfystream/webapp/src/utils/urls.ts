// Common path constants
const WHIP_BASE_PATH = '/live/video-to-video'

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
  // Check if WHIP host environment variable is set
  if (import.meta.env.VITE_WHIP_HOST) {
    return `http://${import.meta.env.VITE_WHIP_HOST}${WHIP_BASE_PATH}`
  }
  
  // Fallback to base URL with default path
  return `${getBaseUrl()}${WHIP_BASE_PATH}`
}

// Get default WHEP endpoint URL  
export const getDefaultWhepUrl = (): string => {
  // Check if WHEP host environment variable is set
  if (import.meta.env.VITE_WHEP_HOST) {
    return `http://${import.meta.env.VITE_WHEP_HOST}`
  }
  
  // Fallback to base URL
  return `${getBaseUrl()}`
}

// Get stream status URL
export const getStreamStatusUrl = (streamId: string): string => {
  // Check if WHIP host environment variable is set
  if (import.meta.env.VITE_WHIP_HOST) {
    return `http://${import.meta.env.VITE_WHIP_HOST}${WHIP_BASE_PATH}/${streamId}/status`
  }
  
  // Fallback to base URL with default path
  return `${getBaseUrl()}${WHIP_BASE_PATH}/${streamId}/status`
}
