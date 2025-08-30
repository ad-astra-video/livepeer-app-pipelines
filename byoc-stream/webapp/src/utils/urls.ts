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

// Get default data stream URL
export const getDefaultDataStreamUrl = (): string => {
  return `${baseUrl}/gateway`
}

// Get default Kafka events URL
export const getDefaultKafkaEventsUrl = (): string => {
  return `${baseUrl}/kafka/events`
}
