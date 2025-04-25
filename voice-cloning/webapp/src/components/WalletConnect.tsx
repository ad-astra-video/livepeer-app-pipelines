import React from 'react';
import { Wallet as WalletIcon, LogOut, X } from 'lucide-react';
import { WalletState } from '../types';

interface WalletConnectProps {
  wallet: WalletState;
  onConnect: () => Promise<void>;
  onDisconnect: () => void;
  onClose: () => void;
}

const WalletConnect: React.FC<WalletConnectProps> = ({ 
  wallet, 
  onConnect, 
  onDisconnect,
  onClose
}) => {
  const handleConnect = async () => {
    try {
      await onConnect();
    } catch (error) {
      console.error('Failed to connect wallet:', error);
    }
  };

  const handleDisconnect = () => {
    onDisconnect();
  };

  const formatAddress = (address: string | null) => {
    if (!address) return '';
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Wallet</h2>
        <button
          onClick={onClose}
          className="p-1 rounded-full hover:bg-gray-100"
          aria-label="Close"
        >
          <X size={20} />
        </button>
      </div>
      
      {wallet.isConnected ? (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              <WalletIcon size={20} className="text-green-500 mr-2" />
              <span className="font-medium">Connected</span>
            </div>
            <button
              onClick={handleDisconnect}
              className="text-red-500 hover:text-red-700 flex items-center text-sm"
            >
              <LogOut size={16} className="mr-1" />
              Disconnect
            </button>
          </div>
          
          <div className="bg-gray-100 p-3 rounded-md">
            <div className="text-sm text-gray-500 mb-1">Address</div>
            <div className="font-mono text-sm break-all">{formatAddress(wallet.address)}</div>
          </div>
          
          {wallet.chainId && (
            <div className="mt-3 text-sm text-gray-500">
              Chain ID: {wallet.chainId}
            </div>
          )}
        </div>
      ) : (
        <div>
          <p className="text-gray-600 mb-4">
            Connect your wallet to sign and process voice cloning requests.
          </p>
          <button
            onClick={handleConnect}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-md flex items-center justify-center transition-colors"
          >
            <WalletIcon size={18} className="mr-2" />
            Connect Wallet
          </button>
        </div>
      )}
    </div>
  );
};

export default WalletConnect;
