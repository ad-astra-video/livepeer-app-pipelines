/**
 * ICE Restart API functions
 * Handles ICE restart requests for connection resilience
 */

export interface IceRestartRequest {
  endpoint: string
  streamId: string
  connectionType: 'whip' | 'whep'
  offerSdp: string
}

/**
 * Sends an ICE restart request
 */
export const sendIceRestartRequest = async ({
  endpoint,
  streamId,
  connectionType,
  offerSdp
}: IceRestartRequest): Promise<string> => {
  let url: string
  
  // Check if the endpoint is already a complete URL (from Location header)
  // If it starts with http, use it directly, otherwise construct the URL
  if (endpoint.startsWith('http')) {
    // Use the Location header URL directly for ICE restart
    url = endpoint
  } else {
    // Fallback to the old method for backward compatibility
    const endpointPath = connectionType === 'whep' ? 'whep' : 'whip'
    url = `${endpoint}/${endpointPath}/${streamId}`
  }
  
  console.log(`Sending ICE restart request to endpoint: ${url}`)
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/sdp',
    },
    body: offerSdp
  })

  if (!response.ok) {
    throw new Error(`ICE restart request failed: ${response.status} ${response.statusText}`)
  }

  // Process the answer SDP if provided
  const answerSdp = await response.text()
  if (answerSdp) {
    const connectionTypeLabel = connectionType === 'whep' ? 'WHEP' : 'WHIP'
    console.log(`Received ICE restart answer from ${connectionTypeLabel} server`)
  }
  
  return answerSdp
}
