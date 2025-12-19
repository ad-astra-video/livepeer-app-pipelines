import React, { useState, useEffect, useRef } from 'react'
import { Plus, X, Tag, ChevronDown, Download, Trash2 } from 'lucide-react'

export interface SavedPrompt {
  id: string
  name: string
  prompts: string
  createdAt: number
  updatedAt: number
}

interface PromptManagerProps {
  onAppendPrompts: (prompts: string, promptName: string) => void
  className?: string
}

const PROMPTS_STORAGE_KEY = 'livepeer-ai-saved-prompts'

const PromptManager: React.FC<PromptManagerProps> = ({ onAppendPrompts, className = '' }) => {
  const [savedPrompts, setSavedPrompts] = useState<SavedPrompt[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [newPromptName, setNewPromptName] = useState('')
  const [newPromptValue, setNewPromptValue] = useState('')
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Load saved prompts from localStorage on component mount
  useEffect(() => {
    const prompts = loadPromptsFromStorage()
    setSavedPrompts(prompts)
  }, [])

  // Handle outside click to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false)
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  const loadPromptsFromStorage = (): SavedPrompt[] => {
    try {
      const saved = localStorage.getItem(PROMPTS_STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        return Array.isArray(parsed) ? parsed : []
      }
    } catch (error) {
      console.warn('Failed to load prompts from localStorage:', error)
    }
    return []
  }

  const savePromptsToStorage = (prompts: SavedPrompt[]) => {
    try {
      localStorage.setItem(PROMPTS_STORAGE_KEY, JSON.stringify(prompts))
    } catch (error) {
      console.warn('Failed to save prompts to localStorage:', error)
    }
  }

  const handleSavePrompt = () => {
    if (!newPromptName.trim() || !newPromptValue.trim()) {
      return
    }

    const newPrompt: SavedPrompt = {
      id: `prompt-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      name: newPromptName.trim(),
      prompts: newPromptValue.trim(),
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    const updatedPrompts = [newPrompt, ...savedPrompts]
    setSavedPrompts(updatedPrompts)
    savePromptsToStorage(updatedPrompts)

    // Reset form
    setNewPromptName('')
    setNewPromptValue('')
    setShowAddModal(false)
  }

  const handleDeletePrompt = (promptId: string) => {
    const updatedPrompts = savedPrompts.filter(p => p.id !== promptId)
    setSavedPrompts(updatedPrompts)
    savePromptsToStorage(updatedPrompts)
    setDeleteConfirmId(null)
  }

  const handleDeleteClick = (promptId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (deleteConfirmId === promptId) {
      // Second click - confirm delete
      handleDeletePrompt(promptId)
    } else {
      // First click - show confirmation
      setDeleteConfirmId(promptId)
      // Auto-cancel confirmation after 3 seconds
      setTimeout(() => {
        setDeleteConfirmId(null)
      }, 3000)
    }
  }

  const handleAppendPrompt = (prompt: SavedPrompt) => {
    onAppendPrompts(prompt.prompts, prompt.name)
    setShowDropdown(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.ctrlKey && newPromptName.trim() && newPromptValue.trim()) {
      e.preventDefault()
      handleSavePrompt()
    }
  }

  return (
    <div className={`relative ${className}`}>
      {/* Main Controls */}
      <div className="flex items-center space-x-2">
        {/* Add New Prompt Button */}
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center space-x-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm rounded-lg transition-colors"
          title="Add new prompt"
        >
          <Plus className="w-4 h-4" />
          <span>Add Prompt</span>
        </button>

        {/* Saved Prompts Dropdown */}
        {savedPrompts.length > 0 && (
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className="flex items-center space-x-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors"
              title="Select saved prompt"
            >
              <Tag className="w-4 h-4" />
              <span>Saved Prompts ({savedPrompts.length})</span>
              <ChevronDown className="w-4 h-4" />
            </button>

            {/* Dropdown List */}
            {showDropdown && (
              <div className="absolute z-20 w-80 mt-1 bg-slate-800 border border-white/20 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                {/* Header with Clear All */}
                <div className="flex items-center justify-between p-2 border-b border-white/10 bg-slate-700/50">
                  <span className="text-xs font-medium text-gray-300">Saved Prompts</span>
                  <button
                    onClick={() => {
                      if (confirm(`Delete all ${savedPrompts.length} saved prompts?`)) {
                        setSavedPrompts([])
                        savePromptsToStorage([])
                        setShowDropdown(false)
                      }
                    }}
                    className="text-xs text-red-400 hover:text-red-300 hover:bg-red-400/10 px-2 py-1 rounded transition-colors"
                    title="Clear all prompts"
                  >
                    Clear All
                  </button>
                </div>
                {savedPrompts.map((prompt) => (
                  <div
                    key={prompt.id}
                    className="group flex items-center justify-between p-2 hover:bg-slate-700 border-b border-white/10 last:border-b-0"
                    title={`${prompt.prompts}\n\nCreated: ${new Date(prompt.createdAt).toLocaleDateString()}`}
                  >
                    <div className="flex items-center space-x-2 flex-1 min-w-0">
                      <Tag className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      <span className="text-sm font-medium text-white truncate">
                        {prompt.name}
                      </span>
                    </div>
                    <div className="flex items-center space-x-1 ml-2">
                      <button
                        onClick={() => handleAppendPrompt(prompt)}
                        className="p-2 text-blue-400 hover:text-blue-300 hover:bg-blue-400/20 rounded-lg transition-colors"
                        title="Append to parameters"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => handleDeleteClick(prompt.id, e)}
                        className={`p-2 rounded-lg transition-all duration-200 ${
                          deleteConfirmId === prompt.id
                            ? 'text-white bg-red-600 hover:bg-red-700 animate-pulse'
                            : 'text-red-400 hover:text-red-300 hover:bg-red-400/20'
                        }`}
                        title={deleteConfirmId === prompt.id ? "Click again to confirm delete" : "Delete prompt"}
                      >
                        {deleteConfirmId === prompt.id ? (
                          <Trash2 className="w-4 h-4" />
                        ) : (
                          <X className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Prompt Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowAddModal(false)}
          />
          
          {/* Modal */}
          <div className="relative bg-slate-900 border border-white/10 rounded-xl w-[90vw] max-w-2xl shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-white/10">
              <div>
                <h2 className="text-xl font-semibold text-white">Add New Prompt</h2>
                <p className="text-sm text-gray-400 mt-1">
                  Save a prompt with a memorable name for easy reuse
                </p>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-2 text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              {/* Prompt Name */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Prompt Name / Tag
                </label>
                <input
                  type="text"
                  value={newPromptName}
                  onChange={(e) => setNewPromptName(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="e.g., 'Anime Style', 'Portrait Mode', 'Landscape'"
                  className="w-full px-4 py-3 bg-black/20 border border-white/10 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  autoFocus
                />
              </div>

              {/* Prompt Value */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Prompt Content
                </label>
                <textarea
                  value={newPromptValue}
                  onChange={(e) => setNewPromptValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Enter your prompt text here..."
                  rows={6}
                  className="w-full px-4 py-3 bg-black/20 border border-white/10 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-vertical"
                />
              </div>

              <div className="text-xs text-gray-400">
                <p>Tip: Press Ctrl+Enter to save quickly</p>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end space-x-3 p-6 border-t border-white/10">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSavePrompt}
                disabled={!newPromptName.trim() || !newPromptValue.trim()}
                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
              >
                Save Prompt
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default PromptManager
