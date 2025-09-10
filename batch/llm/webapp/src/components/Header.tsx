import React from 'react';
import { Settings, LogOut, Loader2 } from 'lucide-react';

interface HeaderProps {
  onOpenSettings: () => void;
  isConnected: boolean;
  onConnect: () => void;
  address?: string;
  disconnectWallet?: () => void;
  isLoading?: boolean;
  networkError?: string | null;
}

const Header: React.FC<HeaderProps> = ({
  onOpenSettings,
  isConnected,
  onConnect,
  address = '',
  disconnectWallet,
  isLoading = false,
  networkError = null
}) => {
  // Format address to show only first 6 and last 4 characters
  const formatAddress = (addr: string) => {
    if (!addr) return '';
    return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
  };

  return (
    <header className="bg-white shadow-sm sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
        <div className="flex items-center">
          <h1 className="text-xl font-bold text-gray-900">Local Chat</h1>
        </div>
        
        <div className="flex items-center space-x-4">
          {networkError && (
            <div className="text-sm font-medium text-red-600 bg-red-50 px-3 py-2 rounded-lg">
              {networkError}
            </div>
          )}
          
          {isConnected ? (
            <div className="flex items-center">
              <div className="flex items-center space-x-2 bg-gray-100 px-3 py-2 rounded-lg">
                <div className="w-2 h-2 rounded-full bg-green-500 mr-2" title="Connected to Arbitrum One"></div>
                <span className="text-sm font-medium text-gray-700">
                  {formatAddress(address)}
                </span>
              </div>
              
              {disconnectWallet && (
                <button
                  onClick={disconnectWallet}
                  className="ml-2 px-3 py-2 text-sm font-medium text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors duration-200"
                  title="Disconnect wallet"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <span>Disconnect</span>
                  )}
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={onConnect}
              className={`px-4 py-2 ${
                isLoading 
                  ? 'bg-blue-400 cursor-not-allowed' 
                  : 'bg-blue-500 hover:bg-blue-600'
              } text-white rounded-lg transition-colors duration-200 flex items-center`}
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 size={18} className="mr-2 animate-spin" />
                  <span>Connecting...</span>
                </>
              ) : (
                <span>Connect Wallet</span>
              )}
            </button>
          )}
          
          <button
            onClick={onOpenSettings}
            className="text-gray-600 hover:text-gray-900 p-2 rounded-full hover:bg-gray-100 transition-colors duration-200"
            title="Settings"
          >
            <Settings size={20} />
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;
