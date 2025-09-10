import React from 'react';
import { X } from 'lucide-react';

interface EnhancementModalProps {
  isOpen: boolean;
  onClose: () => void;
  enhancedPrompt: string;
  originalPrompt: string;
  onKeep: () => void;
  isStreaming?: boolean;
  streamedPrompt?: string; // New prop to receive the streamed content
}

const EnhancementModal: React.FC<EnhancementModalProps> = ({
  isOpen,
  onClose,
  enhancedPrompt,
  originalPrompt,
  onKeep,
  isStreaming = false,
  streamedPrompt = '' // Default empty string
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl p-6 relative max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-gray-700"
        >
          <X size={20} />
        </button>
        
        <h2 className="text-xl font-bold mb-4">
          {isStreaming ? "Enhancing Prompt..." : "Enhanced Prompt"}
        </h2>
        
        <div className="space-y-4">
          <div className="p-3 bg-gray-100 rounded-md">
            <p className="text-sm text-gray-500 mb-1">Original:</p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{originalPrompt}</p>
          </div>
          
          <div className="p-3 bg-blue-50 border border-blue-100 rounded-md">
            <p className="text-sm text-blue-500 mb-1">Enhanced:</p>
            {isStreaming ? (
              <div>
                <div className="flex items-center mb-2">
                  <div className="mr-2 w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-sm text-gray-600">Generating enhancement...</p>
                </div>
                <p className="text-sm text-gray-800 whitespace-pre-wrap">
                  {streamedPrompt || "Thinking..."}
                </p>
              </div>
            ) : (
              <p className="text-sm text-gray-800 whitespace-pre-wrap">{enhancedPrompt}</p>
            )}
          </div>
        </div>
        
        <div className="flex justify-end mt-6 space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            Close
          </button>
          <button
            onClick={onKeep}
            disabled={isStreaming}
            className={`px-4 py-2 border border-transparent rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
              ${isStreaming 
                ? 'bg-blue-300 cursor-not-allowed' 
                : 'bg-blue-600 hover:bg-blue-700'}`
            }
          >
            Keep & Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default EnhancementModal;
