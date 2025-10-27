/**
 * WHEP (WebRTC-HTTP Egress Protocol) API functions
 * Handles all API calls related to WHEP viewing
 */

export interface WhepOfferResponse {
  status: number
  answerSdp: string
  locationHeader: string | null
}

/**
 * Constructs a WHEP URL from base URL and playback URL path
 */
export const constructWhepUrl = (whepUrl: string, playbackUrl: string): string => {
  if (!playbackUrl) return whepUrl
  return playbackUrl
  try {
    const playbackUrlObj = new URL(playbackUrl)
    const pathFromPlayback = playbackUrlObj.pathname
    // Remove trailing slash from whepUrl if present and append the path
    return whepUrl.replace(/\/$/, '') + pathFromPlayback
  } catch (error) {
    console.warn('Failed to parse playback URL, using WHEP URL as-is:', error)
    return whepUrl
  }
}

/**
 * Sends a WHEP offer with retry logic
 */
export const sendWhepOffer = async (
  url: string, 
  sdp: string, 
  maxRetries = 3
): Promise<WhepOfferResponse> => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`WHEP offer attempt ${attempt}/${maxRetries}`)
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/sdp',
        },
        body: sdp
      })

      if (response.ok) {
        const answerSdp = await response.text()
        const locationHeader = response.headers.get('Location')
        
        return {
          status: response.status,
          answerSdp,
          locationHeader
        }
      }

      if (attempt === maxRetries) {
        // Try to get response body for error details
        let errorBody = ''
        try {
          errorBody = await response.text()
        } catch (e) {
          // Ignore if we can't read the body
        }
        const errorMsg = errorBody 
          ? `All ${maxRetries} attempts failed. Status: ${response.status}, Response: ${errorBody}`
          : `All ${maxRetries} attempts failed. Last status: ${response.status}`
        throw new Error(errorMsg)
      }

      // Wait before retry with exponential backoff
      const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 5000)
      console.log(`Attempt ${attempt} failed (${response.status}), retrying in ${waitTime}ms...`)
      await new Promise(resolve => setTimeout(resolve, waitTime))
      
    } catch (error) {
      if (attempt === maxRetries) {
        throw error
      }
      console.warn(`Attempt ${attempt} failed:`, error)
      const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 5000)
      await new Promise(resolve => setTimeout(resolve, waitTime))
    }
  }
  
  throw new Error('All retry attempts failed')
}
