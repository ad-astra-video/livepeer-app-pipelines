/**
 * Stream Start API functions
 * Handles stream initialization and startup requests
 */

export interface StreamStartRequest {
  stream_name: string
  params: string
  stream_id: string
  rtmp_output: string
}

export interface StreamStartParams {
  enable_video_ingress: boolean
  enable_video_egress: boolean
  enable_data_output: boolean
}

export interface StreamStartResponse {
  status_url?: string
  data_url?: string
  update_url?: string
  whip_url?: string
  whep_url?: string
  rtmp_url?: string
  stream_id?: string
}

/**
 * Starts a new stream with the specified configuration
 */
export const startStream = async (
  whipUrl: string,
  streamName: string,
  pipeline: string,
  params: Record<string, any>,
  streamStartParams: StreamStartParams
): Promise<StreamStartResponse> => {
  const reqParams = {
    enable_video_ingress: streamStartParams.enable_video_ingress,
    enable_video_egress: streamStartParams.enable_video_egress,
    enable_data_output: streamStartParams.enable_data_output
  }
  
  const req = {
    request: "{}",
    parameters: JSON.stringify(reqParams),
    capability: pipeline,
    timeout_seconds: 120
  }
  
  const reqStr = JSON.stringify(req)

  const startReq: StreamStartRequest = {
    stream_name: streamName,
    params: JSON.stringify(params),
    stream_id: "",
    rtmp_output: "",
  }
  
  // Start the stream
  const startResp = await fetch(whipUrl, {
    method: 'POST',
    headers: {
      "Content-Type": "application/json",
      "Livepeer": btoa(reqStr)
    },
    body: JSON.stringify(startReq)
  })

  if (!startResp.ok) {
    let errorBody = ''
    try {
      errorBody = await startResp.text()
    } catch (e) {
      // Ignore if we can't read the body
    }
    const errorMsg = errorBody 
      ? `Failed to start stream (${startResp.status}): ${errorBody}`
      : `Failed to start stream (${startResp.status})`
    throw new Error(errorMsg)
  }
  
  const urls = await startResp.json()
  console.log('Stream start response:', urls)
  
  return urls as StreamStartResponse
}