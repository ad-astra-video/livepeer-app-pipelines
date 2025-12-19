
/**
 * Sends a stop stream request
 */
export const stopStream = async (stopUrl: string): Promise<boolean> => {
  try {
    console.log('Stopping stream')

    const response = await fetch(stopUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
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