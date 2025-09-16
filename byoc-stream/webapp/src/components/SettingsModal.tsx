import React, { useState, useEffect } from 'react'
import { X, Save, RotateCcw } from 'lucide-react'
import { getDefaultStreamStartUrl, getDefaultWhepUrl, getDefaultDataStreamUrl, getDefaultKafkaEventsUrl } from '../utils/urls'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (settings: UrlSettings) => void
}

export interface UrlSettings {
  whipUrl: string
  whepUrl: string
  dataStreamUrl: string
  kafkaEventsUrl: string
}

const STORAGE_KEY = 'livepeer-ai-video-streaming-url-settings'

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, onSave }) => {
  const [whipUrl, setWhipUrl] = useState('')
  const [whepUrl, setWhepUrl] = useState('')
  const [dataStreamUrl, setDataStreamUrl] = useState('')
  const [kafkaEventsUrl, setKafkaEventsUrl] = useState('')
  const [hasChanges, setHasChanges] = useState(false)

  // Load settings from localStorage on mount
  useEffect(() => {
    const savedSettings = loadSettingsFromStorage()
    setWhipUrl(savedSettings.whipUrl)
    setWhepUrl(savedSettings.whepUrl)
    setDataStreamUrl(savedSettings.dataStreamUrl)
    setKafkaEventsUrl(savedSettings.kafkaEventsUrl)
  }, [isOpen])

  const loadSettingsFromStorage = (): UrlSettings => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        return {
          whipUrl: parsed.whipUrl || getDefaultStreamStartUrl(),
          whepUrl: parsed.whepUrl || getDefaultWhepUrl(),
          dataStreamUrl: parsed.dataStreamUrl || getDefaultDataStreamUrl(),
          kafkaEventsUrl: parsed.kafkaEventsUrl || getDefaultKafkaEventsUrl()
        }
      }
    } catch (error) {
      console.warn('Failed to load settings from localStorage:', error)
    }
    
    return {
      whipUrl: getDefaultStreamStartUrl(),
      whepUrl: getDefaultWhepUrl(),
      dataStreamUrl: getDefaultDataStreamUrl(),
      kafkaEventsUrl: getDefaultKafkaEventsUrl()
    }
  }

  const saveSettingsToStorage = (settings: UrlSettings) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    } catch (error) {
      console.warn('Failed to save settings to localStorage:', error)
    }
  }

  const handleWhipUrlChange = (value: string) => {
    setWhipUrl(value)
    setHasChanges(true)
  }

  const handleWhepUrlChange = (value: string) => {
    setWhepUrl(value)
    setHasChanges(true)
  }

  const handleDataStreamUrlChange = (value: string) => {
    setDataStreamUrl(value)
    setHasChanges(true)
  }

  const handleKafkaEventsUrlChange = (value: string) => {
    setKafkaEventsUrl(value)
    setHasChanges(true)
  }

  const handleSave = () => {
    const settings: UrlSettings = { 
      whipUrl, 
      whepUrl, 
      dataStreamUrl, 
      kafkaEventsUrl 
    }
    saveSettingsToStorage(settings)
    onSave(settings)
    setHasChanges(false)
    
    // Dispatch custom event to notify components of settings change
    window.dispatchEvent(new CustomEvent('live-settings-changed', { 
      detail: settings 
    }))
    
    onClose()
  }

  const handleReset = () => {
    const defaults = {
      whipUrl: getDefaultStreamStartUrl(),
      whepUrl: getDefaultWhepUrl(),
      dataStreamUrl: getDefaultDataStreamUrl(),
      kafkaEventsUrl: getDefaultKafkaEventsUrl()
    }
    setWhipUrl(defaults.whipUrl)
    setWhepUrl(defaults.whepUrl)
    setDataStreamUrl(defaults.dataStreamUrl)
    setKafkaEventsUrl(defaults.kafkaEventsUrl)
    setHasChanges(true)
  }

  const handleCancel = () => {
    // Reload from storage to discard changes
    const savedSettings = loadSettingsFromStorage()
    setWhipUrl(savedSettings.whipUrl)
    setWhepUrl(savedSettings.whepUrl)
    setDataStreamUrl(savedSettings.dataStreamUrl)
    setKafkaEventsUrl(savedSettings.kafkaEventsUrl)
    setHasChanges(false)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[9999] overflow-hidden">
      {/* Backdrop with blur */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-all duration-300"
        onClick={handleCancel}
      />
      
      {/* Modal */}
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="bg-slate-800 rounded-xl shadow-2xl w-full max-w-md transform transition-all duration-300 scale-100 border border-slate-700">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-700">
            <h2 className="text-lg font-semibold text-white">URL Settings</h2>
            <button
              onClick={handleCancel}
              className="p-1 text-gray-400 hover:text-white transition-colors"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                WHIP URL (Publishing)
              </label>
              <input
                type="text"
                value={whipUrl}
                onChange={(e) => handleWhipUrlChange(e.target.value)}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                placeholder="Enter WHIP URL for publishing streams"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                WHEP URL (Viewing)
              </label>
              <input
                type="text"
                value={whepUrl}
                onChange={(e) => handleWhepUrlChange(e.target.value)}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                placeholder="Enter WHEP URL for viewing streams"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Data Stream URL (SSE Events)
              </label>
              <input
                type="text"
                value={dataStreamUrl}
                onChange={(e) => handleDataStreamUrlChange(e.target.value)}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                placeholder="Enter data stream URL for SSE events"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Kafka Events URL
              </label>
              <input
                type="text"
                value={kafkaEventsUrl}
                onChange={(e) => handleKafkaEventsUrlChange(e.target.value)}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                placeholder="Enter Kafka events URL"
              />
            </div>

            <div className="text-xs text-gray-400">
              <p>These URLs will be saved to your browser's local storage and used as defaults for the URL inputs in the stream controls and data streaming components.</p>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-6 border-t border-gray-700">
            <button
              onClick={handleReset}
              className="flex items-center space-x-2 px-3 py-2 text-gray-400 hover:text-white transition-colors"
              title="Reset to defaults"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Reset</span>
            </button>

            <div className="flex items-center space-x-3">
              <button
                onClick={handleCancel}
                className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!hasChanges}
                className="flex items-center space-x-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save className="w-4 h-4" />
                <span>Save</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SettingsModal

// Export function to load settings from storage for use in other components
export const loadSettingsFromStorage = (): UrlSettings => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      return {
        whipUrl: parsed.whipUrl || getDefaultStreamStartUrl(),
        whepUrl: parsed.whepUrl || getDefaultWhepUrl(),
        dataStreamUrl: parsed.dataStreamUrl || getDefaultDataStreamUrl(),
        kafkaEventsUrl: parsed.kafkaEventsUrl || getDefaultKafkaEventsUrl()
      }
    }
  } catch (error) {
    console.warn('Failed to load settings from localStorage:', error)
  }
  
  return {
    whipUrl: getDefaultStreamStartUrl(),
    whepUrl: getDefaultWhepUrl(),
    dataStreamUrl: getDefaultDataStreamUrl(),
    kafkaEventsUrl: getDefaultKafkaEventsUrl()
  }
}
