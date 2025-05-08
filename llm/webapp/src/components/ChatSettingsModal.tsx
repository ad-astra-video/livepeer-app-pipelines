import React, { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';
import { useChatSettings } from '../context/ChatSettingsContext';
import { ChatSettings } from '../types';

interface ChatSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ChatSettingsModal: React.FC<ChatSettingsModalProps> = ({ isOpen, onClose }) => {
  const { chatSettings, updateChatSettings, saveChatSettings } = useChatSettings();
  const [formData, setFormData] = useState<ChatSettings>({
    systemPrompt: chatSettings.systemPrompt,
    maxTokens: chatSettings.maxTokens,
    temperature: chatSettings.temperature,
    topP: chatSettings.topP,
    topK: chatSettings.topK,
	  stream: chatSettings.stream,
    stream_options: chatSettings.stream_options,
    model: chatSettings.model
  });
  
  // Update form data when modal opens or settings change
  useEffect(() => {
    if (isOpen) {
      setFormData({
        systemPrompt: chatSettings.systemPrompt,
        maxTokens: chatSettings.maxTokens,
        temperature: chatSettings.temperature,
        topP: chatSettings.topP,
        topK: chatSettings.topK,
		    stream: chatSettings.stream,
        stream_options: chatSettings.stream_options,
        model: chatSettings.model
      });
    }
  }, [isOpen, chatSettings]);

  if (!isOpen) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    
    // Handle numeric values
    if (name === 'maxTokens' || name === 'topK') {
      setFormData((prev) => ({ ...prev, [name]: parseInt(value) || 0 }));
    } else if (name === 'temperature' || name === 'topP') {
      setFormData((prev) => ({ ...prev, [name]: parseFloat(value) || 0 }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateChatSettings(formData);
    saveChatSettings();
    onClose();
  };

  const handleSaveSettings = () => {
    updateChatSettings(formData);
    saveChatSettings();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Chat Settings</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X size={24} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-gray-700 mb-2" htmlFor="model">
              Model
            </label>
            <input
              type="text"
              id="model"
              name="model"
              value={formData.model}
              onChange={handleChange}
              className="w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter model ID (e.g., Qwen\Qwen-2.5-7B-Instruct)"
            />
            <p className="text-sm text-gray-500 mt-1">
              Enter the AI model ID to use for chat
            </p>
          </div>
          
          <div className="mb-4">
            <label className="block text-gray-700 mb-2" htmlFor="systemPrompt">
              System Prompt
            </label>
            <textarea
              id="systemPrompt"
              name="systemPrompt"
              value={formData.systemPrompt}
              onChange={handleChange}
              className="w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 h-24 resize-none"
              placeholder="You are a helpful assistant."
            />
            <p className="text-sm text-gray-500 mt-1">
              Instructions for the AI model about how to behave
            </p>
          </div>
          
		  <div className="mb-4">
			  <label className="block text-gray-700 mb-2" htmlFor="stream">
				Stream: {formData.stream ? "True" : "False"}
			  </label>
			  <select
				id="stream"
				name="stream"
				value={formData.stream ? "true" : "false"}
				onChange={(e) =>
				  setFormData((prev) => ({
					...prev,
					stream: e.target.value === "true",
				  }))
				}
				className="w-full border rounded px-3 py-2 text-gray-700"
			  >
				<option value="true">True</option>
				<option value="false">False</option>
			  </select>
			  <p className="text-sm text-gray-500 mt-1">
				Set to True to stream the response
			  </p>
			</div>

          <div className="mb-4">
            <label className="block text-gray-700 mb-2" htmlFor="maxTokens">
              Max Tokens: {formData.maxTokens}
            </label>
            <input
              type="range"
              id="maxTokens"
              name="maxTokens"
              min="1"
              max="32768"
              step="1"
              value={formData.maxTokens}
              onChange={handleChange}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-500">
              <span>1</span>
              <span>32768</span>
            </div>
            <p className="text-sm text-gray-500 mt-1">
              Maximum number of tokens to generate
            </p>
          </div>
          
          <div className="mb-4">
            <label className="block text-gray-700 mb-2" htmlFor="temperature">
              Temperature: {formData.temperature.toFixed(2)}
            </label>
            <input
              type="range"
              id="temperature"
              name="temperature"
              min="0"
              max="2"
              step="0.01"
              value={formData.temperature}
              onChange={handleChange}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-500">
              <span>0 (Deterministic)</span>
              <span>2 (Creative)</span>
            </div>
            <p className="text-sm text-gray-500 mt-1">
              Controls randomness: lower values are more deterministic, higher values are more creative
            </p>
          </div>
          
          <div className="mb-4">
            <label className="block text-gray-700 mb-2" htmlFor="topP">
              Top P: {formData.topP.toFixed(2)}
            </label>
            <input
              type="range"
              id="topP"
              name="topP"
              min="0"
              max="1"
              step="0.01"
              value={formData.topP}
              onChange={handleChange}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-500">
              <span>0</span>
              <span>1</span>
            </div>
            <p className="text-sm text-gray-500 mt-1">
              Controls diversity via nucleus sampling
            </p>
          </div>
          
          <div className="mb-4">
            <label className="block text-gray-700 mb-2" htmlFor="topK">
              Top K: {formData.topK}
            </label>
            <input
              type="range"
              id="topK"
              name="topK"
              min="1"
              max="100"
              step="1"
              value={formData.topK}
              onChange={handleChange}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-500">
              <span>1</span>
              <span>100</span>
            </div>
            <p className="text-sm text-gray-500 mt-1">
              Limits vocabulary to top K tokens
            </p>
          </div>
          
          <div className="flex justify-between">
            <button
              type="button"
              onClick={handleSaveSettings}
              className="flex items-center px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
            >
              <Save size={16} className="mr-2" />
              Save Settings
            </button>
            
            <div>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-700 mr-2"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Save & Close
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ChatSettingsModal;
