import { useState } from 'react';
import { Settings as SettingsIcon, Wallet as WalletIcon } from 'lucide-react';
import AudioRecorder from './components/AudioRecorder';
import WalletConnect from './components/WalletConnect';
import Settings from './components/Settings';
import { useWallet } from './hooks/useWallet';
import { useSettings } from './hooks/useSettings';

function App() {
  const { wallet, connectWallet, disconnectWallet } = useWallet();
  const { settings, updateSettings, clearEthAddress } = useSettings();
  
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  
  // Sync wallet address with settings when wallet connects/disconnects
  if (wallet.isConnected && wallet.address && settings.ethAddress !== wallet.address) {
    updateSettings({ ethAddress: wallet.address });
  } else if (!wallet.isConnected && settings.ethAddress) {
    clearEthAddress();
  }

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <header className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Voice Cloning App</h1>
        
        <div className="flex space-x-2">
          <button
            onClick={() => setIsSettingsModalOpen(true)}
            className="p-2 bg-white rounded-full shadow hover:bg-gray-50"
            aria-label="Settings"
          >
            <SettingsIcon size={20} />
          </button>
          
          <button
            onClick={() => setIsWalletModalOpen(true)}
            className={`p-2 rounded-full shadow flex items-center ${
              wallet.isConnected ? 'bg-green-100 text-green-800' : 'bg-white hover:bg-gray-50'
            }`}
            aria-label="Wallet"
          >
            <WalletIcon size={20} />
            {wallet.isConnected && (
              <span className="ml-2 text-xs hidden sm:inline">
                {wallet.address?.substring(0, 6)}...{wallet.address?.substring(wallet.address.length - 4)}
              </span>
            )}
          </button>
        </div>
      </header>
      
      <main className="max-w-2xl mx-auto">
        <AudioRecorder />
      </main>
      
      {/* Wallet Modal */}
      {isWalletModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <WalletConnect
              wallet={wallet}
              onConnect={connectWallet}
              onDisconnect={disconnectWallet}
              onClose={() => setIsWalletModalOpen(false)}
            />
          </div>
        </div>
      )}
      
      {/* Settings Modal */}
      {isSettingsModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <Settings
              settings={settings}
              onUpdateSettings={updateSettings}
              onClose={() => setIsSettingsModalOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
