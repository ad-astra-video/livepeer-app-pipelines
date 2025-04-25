import React, { useState, useEffect, useRef } from 'react';
import { X, Save } from 'lucide-react';
import { useSettings } from '../context/SettingsContext';
import { getCurrentBalance } from '../services/api';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { settings, updateSettings, saveSettings } = useSettings();
  const [formData, setFormData] = useState({
    apiBaseUrl: settings.apiBaseUrl,
    capability: settings.capability,
    resourceUrlPath: settings.resourceUrlPath
  });
  const [balance, setBalance] = useState<number | null>(null);
  
  // Only update form data when modal opens or settings change significantly
  useEffect(() => {
    if (isOpen) {
      setFormData({
        apiBaseUrl: settings.apiBaseUrl,
        capability: settings.capability,
        resourceUrlPath: settings.resourceUrlPath
      });
      
      // Get the current balance when modal opens
      setBalance(getCurrentBalance());
    }
  }, [isOpen, settings.ethereumAddress]);

  // Update balance periodically when modal is open
  useEffect(() => {
    if (!isOpen) return;
    
    const intervalId = setInterval(() => {
      setBalance(getCurrentBalance());
    }, 5000); // Update every 5 seconds
    
    return () => clearInterval(intervalId);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings(formData);
    saveSettings();
    onClose();
  };

  const handleSaveSettings = () => {
    updateSettings(formData);
    saveSettings();
  };

  // Format wallet address for display
  const formatWalletAddress = () => {
    if (!settings.ethereumAddress) return "Not connected";
    return settings.ethereumAddress;
  };

  // Format balance for display
  const formatBalance = () => {
    if (balance === null) return "Unknown";
    return `${balance} wei`;
  };

  // Determine the wallet connection status class
  const getWalletStatusClass = () => {
    return settings.ethereumAddress 
      ? "bg-green-50 border-green-200 text-green-800" 
      : "bg-gray-100 text-gray-500";
  };

  // Determine the balance status class
  const getBalanceStatusClass = () => {
    if (balance === null) return "bg-gray-100 text-gray-500";
    if (balance <= 0) return "bg-red-50 border-red-200 text-red-800";
    return "bg-green-50 border-green-200 text-green-800";
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Settings</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X size={24} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-gray-700 mb-2" htmlFor="apiBaseUrl">
              API Base URL
            </label>
            <input
              type="text"
              id="apiBaseUrl"
              name="apiBaseUrl"
              value={formData.apiBaseUrl}
              onChange={handleChange}
              className="w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="https://api.example.com"
            />
          </div>

          <div className="mb-4">
            <label className="block text-gray-700 mb-2" htmlFor="resourceUrlPath">
              Resource URL Path
            </label>
            <input
              type="text"
              id="resourceUrlPath"
              name="resourceUrlPath"
              value={formData.resourceUrlPath}
              onChange={handleChange}
              className="w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder=""
            />
            <p className="text-sm text-gray-500 mt-1">
              subpath the resource is available on if applicable
            </p>
            <p className="text-sm text-gray-500 mt-1">
              (e.g. /v1/chat/completions)
            </p>
          </div>
          
          <div className="mb-4">
            <label className="block text-gray-700 mb-2" htmlFor="capability">
              Capability
            </label>
            <input
              type="text"
              id="capability"
              name="capability"
              value={formData.capability}
              onChange={handleChange}
              className="w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="llm-generate"
            />
            <p className="text-sm text-gray-500 mt-1">
              Default: llm-generate
            </p>
          </div>
          
          <div className="mb-4">
            <label className="block text-gray-700 mb-2" htmlFor="ethereumAddress">
              Ethereum Address
            </label>
            <div className={`w-full p-3 border rounded ${getWalletStatusClass()} flex items-center`}>
              {settings.ethereumAddress && (
                <div className="w-2 h-2 rounded-full bg-green-500 mr-2" title="Connected"></div>
              )}
              <span className="font-mono text-sm break-all">
                {formatWalletAddress()}
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-1">
              {settings.ethereumAddress 
                ? "Wallet connected and ready for signing messages" 
                : "Connect your wallet from the main screen to enable chat"}
            </p>
          </div>

          <div className="mb-4">
            <label className="block text-gray-700 mb-2" htmlFor="balance">
              Balance
            </label>
            <div className={`w-full p-3 border rounded ${getBalanceStatusClass()} flex items-center`}>
              {balance !== null && balance > 0 && (
                <div className="w-2 h-2 rounded-full bg-green-500 mr-2" title="Available"></div>
              )}
              {balance !== null && balance <= 0 && (
                <div className="w-2 h-2 rounded-full bg-red-500 mr-2" title="Empty"></div>
              )}
              <span className="font-mono text-sm break-all">
                {formatBalance()}
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-1">
              {balance === null 
                ? "Balance will be available after connecting wallet" 
                : balance <= 0 
                  ? "Balance is empty or insufficient" 
                  : "Current balance available for API requests"}
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

export default SettingsModal;
