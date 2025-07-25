/**
 * Status API functions
 */

import { getBaseUrl, getStreamStatusUrl } from '../utils/urls'
import { loadSettingsFromStorage } from '../components/SettingsModal'

/**
 * Fetch stream status data
 */
export const fetchStreamStatus = async (streamId?: string | null): Promise<any> => {
  try {
    const savedSettings = loadSettingsFromStorage()
    
	if (streamId === null) {
		throw new Error('Stream ID cannot be null')
	}
		
    let endpoint = getStreamStatusUrl(streamId, savedSettings.whipUrl)
    console.log(`Using stream-specific status URL: ${endpoint}`)
        
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
