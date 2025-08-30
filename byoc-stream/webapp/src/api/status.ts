/**
 * Status API functions
 */
import { loadSettingsFromStorage } from '../components/SettingsModal'

/**
 * Fetch stream status data
 */
export const fetchStreamStatus = async (customStatusUrl?: string): Promise<any> => {
  try {
    let endpoint: string
    
    if (customStatusUrl) {
      // Use direct status URL from stream start response
      endpoint = customStatusUrl
      console.log(`Using direct status URL from start response: ${endpoint}`)
    } else {
      console.log("no status url provided")
    }
        
    const response = await fetch(endpoint)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    
    const data = await response.json()
    return data
  } catch (error) {
    throw error instanceof Error ? error : new Error('Failed to fetch status')
  }
}
