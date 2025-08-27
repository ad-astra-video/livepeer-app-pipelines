// Base URL for all endpoints (protocol, host, port)
const baseUrl = `${window.location.protocol}//${window.location.hostname}:${window.location.port || '8088'}`;

// Get default WHIP endpoint URL
export const getDefaultStreamStartUrl = (): string => {
  return `${baseUrl}/gateway/ai/stream/start`
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
  return `${baseUrl}/mediamtx`
}

// Get stream status URL
export const getStreamStatusUrl = (streamId: string, baseUrl?: string): string => {
  const whipBaseUrl = baseUrl || getDefaultStreamStartUrl()
  // Extract base URL without the /live/video-to-video path if it exists
  let cleanBaseUrl = whipBaseUrl
  
  // If the URL contains /live/video-to-video, use just the base part
  if (whipBaseUrl.includes('/live/video-to-video')) {
    cleanBaseUrl = whipBaseUrl.replace(/\/live\/video-to-video.*$/, '')
  } else {
    // Otherwise, assume the entire URL is the base URL
    cleanBaseUrl = whipBaseUrl.replace(/\/$/, '') // Remove trailing slash if present
  }
  
  return `${cleanBaseUrl}/live/video-to-video/${streamId}/status`
}

// Get default data stream URL
export const getDefaultDataStreamUrl = (): string => {
  return `${baseUrl}/gateway`
}

// Get default Kafka events URL
export const getDefaultKafkaEventsUrl = (): string => {
  return `${baseUrl}/kafka/events`
}
