/**
 * Stream Update API functions
 * Handles updates to active streams (prompts, resolution, etc.)
 */

export interface StreamUpdateData {
  height: number
  width: number
  prompts: string | string[]
}

export interface StreamUpdateRequest {
  whipUrl: string
  streamName: string
  updateData: StreamUpdateData
}

/**
 * Sends an update request to modify stream parameters
 */
export const sendStreamUpdate = async ({
  whipUrl,
  streamName,
  updateData
}: StreamUpdateRequest): Promise<boolean> => {
  try {
    console.log('Sending update:', updateData)

    // Send update request - construct URL with stream name
    const updateUrl = `${whipUrl}/${streamName}/update`
    const response = await fetch(updateUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
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
