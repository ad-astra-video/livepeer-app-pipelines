import React from 'react'
import { AlertCircle, X } from 'lucide-react'

interface ErrorModalProps {
  isOpen: boolean
  title: string
  message: string
  onClose: () => void
}

const ErrorModal: React.FC<ErrorModalProps> = ({ isOpen, title, message, onClose }) => {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-gradient-to-br from-slate-800 to-slate-900 border border-red-500/30 rounded-xl max-w-md w-full mx-4 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-red-500/20">
          <div className="flex items-center space-x-3">
            <div className="flex items-center justify-center w-10 h-10 bg-red-500/20 rounded-full">
              <AlertCircle className="w-6 h-6 text-red-400" />
            </div>
            <h2 className="text-xl font-semibold text-white">{title}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-all duration-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Content */}
        <div className="p-6">
          <p className="text-gray-300 text-sm leading-relaxed break-words">{message}</p>
        </div>
        
        {/* Footer */}
        <div className="p-6 border-t border-white/10 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-all duration-200 shadow-lg hover:shadow-red-500/50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

export default ErrorModal
