import React, { useState } from 'react';
import { X } from 'lucide-react';

interface SettingsProps {
  settings: {
    apiBaseUrl: string;
    capability: string;
    ethAddress: string;
  };
  onUpdateSettings: (settings: Partial<{
    apiBaseUrl: string;
    capability: string;
    ethAddress: string;
  }>) => void;
  onClose: () => void;
}

const Settings: React.FC<SettingsProps> = ({ 
  settings,
  onUpdateSettings,
  onClose
}) => {
  const [baseUrl, setBaseUrl] = useState(settings.apiBaseUrl);
  const [capability, setCapability] = useState(settings.capability);

  const handleSave = () => {
    onUpdateSettings({
      apiBaseUrl: baseUrl,
      capability: capability
    });
    onClose();
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Settings</h2>
        <button
          onClick={onClose}
          className="p-1 rounded-full hover:bg-gray-100"
          aria-label="Close"
        >
          <X size={20} />
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <label htmlFor="baseUrl" className="block text-sm font-medium text-gray-700 mb-2">
            API Base URL
          </label>
          <input
            id="baseUrl"
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="https://example.com/api"
          />
          <p className="mt-1 text-sm text-gray-500">
            Enter the base URL for API calls (without trailing slash)
          </p>
        </div>

        <div>
          <label htmlFor="ethAddress" className="block text-sm font-medium text-gray-700 mb-2">
            ETH Address
          </label>
          <input
            id="ethAddress"
            type="text"
            value={settings.ethAddress || "Not connected"}
            disabled
            className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-500"
          />
          <p className="mt-1 text-sm text-gray-500">
            {settings.ethAddress ? "Your connected wallet address" : "Connect your wallet to use this feature"}
          </p>
        </div>

        <div>
          <label htmlFor="capability" className="block text-sm font-medium text-gray-700 mb-2">
            Capability
          </label>
          <input
            id="capability"
            type="text"
            value={capability}
            onChange={(e) => setCapability(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="voice-clone"
          />
          <p className="mt-1 text-sm text-gray-500">
            Enter the capability for the voice cloning service
          </p>
        </div>
      </div>

      <div className="flex justify-end space-x-3 mt-6">
        <button
          onClick={onClose}
          className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Save
        </button>
      </div>
    </div>
  );
};

export default Settings;
