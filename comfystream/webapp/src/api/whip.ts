/**
 * WHIP (WebRTC-HTTP Ingestion Protocol) API functions
 * Handles all API calls related to WHIP streaming
 */

export interface WhipOfferResponse {
  status: number
  answerSdp: string
  streamId: string | null
  playbackUrl: string | null
  locationHeader: string | null
}

export interface WhipStopRequest {
  streamId: string
  whipUrl: string
}

export interface PipelineParams {
  width?: number
  height?: number
  prompts?: any
  max_framerate?: number
}

/**
 * Constructs a WHIP URL with all necessary parameters
 */
export const constructWhipUrl = (
  baseUrl: string, 
  streamName: string, 
  pipeline: string, 
  width: number, 
  height: number,
  prompts: string[],
  streamId?: string,
  maxFramerate?: number
): string => {
  let url = new URL(baseUrl)
  
  // Add stream name to the path if provided
  if (streamName && streamName.trim()) {
    // Ensure stream name is URL-safe
    const safeName = streamName.trim()
    url.pathname += `/${safeName}/whip`
  }
  
  // Build query parameters
  if (pipeline && pipeline.trim()) {
    url.searchParams.set('pipeline', pipeline.trim())
  }
  
  // Add streamId if provided
  if (streamId && streamId.trim()) {
    url.searchParams.set('streamId', streamId.trim())
  }
  
  var params: PipelineParams = {}
  if (width && height && width > 0 && height > 0) {
    params.width = width
    params.height = height
  }
  
  // Add prompts from the prompt fields
  if (prompts.length === 0) {
    params.prompts = ""
  } else if (prompts.length === 1) {
    params.prompts = prompts[0]
  } else {
    params.prompts = prompts
  }
  
  // Add max framerate if provided
  if (maxFramerate && maxFramerate > 0) {
    params.max_framerate = maxFramerate
  }

  // Convert the params object to a JSON string
  const paramsString = JSON.stringify(params)
  
  // URL encode the JSON string and add it to the query params
  url.searchParams.set('params', paramsString)

  return url.toString()
}

/**
 * Sends a WHIP offer with retry logic
 */
export const sendWhipOffer = async (
  url: string, 
  sdp: string, 
  maxRetries = 3
): Promise<WhipOfferResponse> => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`WHIP offer attempt ${attempt}/${maxRetries} to URL: ${url}`)
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/sdp',
        },
        body: sdp
      })

      if (response.status === 201) {
        const answerSdp = await response.text()
        const streamId = response.headers.get('X-Stream-Id')
        const playbackUrl = response.headers.get('Livepeer-Playback-Url')
        const locationHeader = response.headers.get('Location')
        
        return {
          status: response.status,
          answerSdp,
          streamId,
          playbackUrl,
          locationHeader
        }
      }

      if (attempt === maxRetries) {
        throw new Error(`All ${maxRetries} attempts failed. Last status: ${response.status}`)
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

/**
 * Sends a stop stream request
 */
export const stopStream = async ({ streamId, whipUrl }: WhipStopRequest): Promise<boolean> => {
  try {
    console.log(`Stopping stream with ID: ${streamId}`)
    
    const stopUrl = whipUrl.replace('/stream/start', '/stream/stop')
    const requestData = {
      "request": JSON.stringify({"stop_stream": true, "stream_id": streamId}),
      "parameters": JSON.stringify({}),
      "capability": 'comfystream',
      "timeout_seconds": 30
    }
    
    const livepeerHeader = btoa(JSON.stringify(requestData))
    
    const response = await fetch(stopUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Livepeer': livepeerHeader
      },
      body: JSON.stringify({ stream_id: streamId })
    })
    
    if (response.ok) {
      console.log('Stream stop request sent successfully')
      return true
    } else {
      console.warn('Failed to send stream stop request:', response.status)
      return false
    }
  } catch (error) {
    console.error('Error sending stop request:', error)
    return false
  }
}
