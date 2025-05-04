/**
 * Generates a random seed for image generation
 * @returns {number} A random 10-digit number
 */
export const generateRandomSeed = () => {
  return Math.floor(Math.random() * 9000000000) + 1000000000
}

/**
 * Formats a date string to a readable format
 * @param {string} dateString - ISO date string
 * @returns {string} Formatted date string
 */
export const formatDate = (dateString) => {
  const date = new Date(dateString)
  return date.toLocaleString()
}

/**
 * Default API Base URL
 */
const DEFAULT_API_BASE_URL = 'http://localhost:8088/gateway'

/**
 * Loads settings from localStorage
 * @returns {Object} The loaded settings or default settings
 */
export const loadSettings = () => {
  try {
    const savedSettings = localStorage.getItem('apiSettings')
    return savedSettings 
      ? JSON.parse(savedSettings) 
      : { apiBaseUrl: DEFAULT_API_BASE_URL, timeout: 5 }
  } catch (error) {
    console.error('Error loading settings:', error)
    return { apiBaseUrl: DEFAULT_API_BASE_URL, timeout: 5 }
  }
}

/**
 * Saves settings to localStorage
 * @param {Object} settings - The settings to save
 */
export const saveSettings = (settings) => {
  try {
    localStorage.setItem('apiSettings', JSON.stringify(settings))
  } catch (error) {
    console.error('Error saving settings:', error)
  }
}

/**
 * Extracts metadata from response headers
 * @param {Response} response - The fetch API response
 * @returns {Object|null} - The parsed metadata or null if not found
 */
export const extractMetadata = (response) => {
  try {
    const metadataHeader = response.headers.get('X-Metadata')
    if (!metadataHeader) return null
    
    const metadata = JSON.parse(metadataHeader)
    return metadata.metadata ? JSON.parse(metadata.metadata) : metadata
  } catch (error) {
    console.error('Error extracting metadata:', error)
    return null
  }
}

/**
 * Sends an image generation request to the API
 * @param {Object} params - The parameters for image generation
 * @param {string} baseUrl - The base URL for the API
 * @param {number} timeout - The timeout in seconds for the API request
 * @returns {Promise} - A promise that resolves with the generated image data and metadata
 */
export const generateImage = async (params, baseUrl = DEFAULT_API_BASE_URL, timeout = 5) => {
  // Use the provided base URL or default
  const url = baseUrl ? `${baseUrl}/process/request/text-to-image` : '/process/request/text-to-image'
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Livepeer-Job': btoa(JSON.stringify({
        request: JSON.stringify({ run: "gen-image" }),
        parameters: JSON.stringify({}),
        capability: "gen-image",
        timeout_seconds: timeout,
      }))
    },
    body: JSON.stringify(params)
  })

  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}`)
  }

  // Extract metadata from headers
  const metadata = extractMetadata(response)
  
  // Parse the response body
  const data = await response.blob()
  
  // Convert the Blob to a data URL
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(data)
  })

  // Return both the data and metadata
  return {
    imageUrl: dataUrl,
    metadata
  }
}

/**
 * Enhances a prompt using the API
 * @param {string} prompt - The prompt to enhance
 * @param {string} baseUrl - The base URL for the API
 * @param {number} timeout - The timeout in seconds for the API request
 * @returns {Promise<string>} - A promise that resolves with the enhanced prompt
 */
export const enhancePrompt = async (prompt, baseUrl = DEFAULT_API_BASE_URL, timeout = 5) => {
  // Use the provided base URL or default
  const url = baseUrl ? `${baseUrl}/process/request/prompt-enhance` : '/process/request/prompt-enhance'
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Livepeer-Job': btoa(JSON.stringify({
        request: JSON.stringify({ run: "enhance-prompt" }),
        parameters: JSON.stringify({}),
        capability: "gen-image",
        timeout_seconds: timeout,
      }))
    },
    body: JSON.stringify({ "prompt": prompt })
  })

  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}`)
  }

  const data = await response.json()
  return data.prompt || prompt
}
