/**
 * Stream Update API functions
 * Handles updates to active streams (prompts, resolution, etc.)
 */

export interface StreamUpdateData {
  [key: string]: any
}

export interface StreamUpdateRequest {
  whipUrl?: string
  streamName?: string
  updateData: StreamUpdateData
  customUpdateUrl?: string  // Direct update URL from start response
}

/**
 * Sends an update request to modify stream parameters
 */
export const sendStreamUpdate = async ({
  whipUrl,
  streamName,
  updateData,
  customUpdateUrl
}: StreamUpdateRequest): Promise<boolean> => {
  try {
    console.log('Sending update:', updateData)

    let updateUrl: string
    
    if (customUpdateUrl) {
      // Use direct update URL from stream start response
      updateUrl = customUpdateUrl
      console.log(`Using direct update URL from start response: ${updateUrl}`)
    } else {
      // Fallback to constructed URL
      if (!whipUrl || !streamName) {
        throw new Error('whipUrl and streamName are required when customUpdateUrl is not provided')
      }
      updateUrl = `${whipUrl}/${streamName}/update`
      console.log(`Using constructed update URL: ${updateUrl}`)
    }

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
