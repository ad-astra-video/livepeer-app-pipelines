/**
 * Stream Update API functions
 * Handles updates to active streams (prompts, resolution, etc.)
 */

export interface StreamUpdateData {
  [key: string]: any
}

export interface StreamUpdateRequest {
  updateUrl: string  // Update URL from start response
  streamId: string
  pipeline: string
  updateData: StreamUpdateData
}

/**
 * Sends an update request to modify stream parameters
 */
export const sendStreamUpdate = async ({
  updateUrl,
  streamId,
  pipeline,
  updateData
}: StreamUpdateRequest): Promise<boolean> => {
  try {
    console.log('Sending update:', updateData)
    console.log(`Using update URL: ${updateUrl}`)

    const requestData = {
      "request": JSON.stringify({"stream_id": streamId}),
      "parameters": JSON.stringify({}),
      "capability": pipeline,
      "timeout_seconds": 5
    }

    const livepeerHeader = btoa(JSON.stringify(requestData))

    const response = await fetch(updateUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Livepeer': livepeerHeader
      },
      body: JSON.stringify(updateData)
    })

    if (response.status === 200) {
      console.log('Update sent successfully')
      return true
    } else {
      throw new Error(`Update failed: ${response.status} ${response.statusText}`)
    }
  } catch (error) {
    console.error('Error sending update:', error)
    throw error
  }
}
