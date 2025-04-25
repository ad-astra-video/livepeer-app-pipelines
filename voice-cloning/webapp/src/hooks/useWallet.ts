import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { WalletState } from '../types';

export function useWallet() {
  const [wallet, setWallet] = useState<WalletState>({
    address: null,
    isConnected: false,
    chainId: null,
    provider: null,
    signer: null,
  });

  // Check if wallet is already connected on component mount
  useEffect(() => {
    const checkConnection = async () => {
      if (window.ethereum) {
        try {
          // Check if we're already connected
          const provider = new ethers.providers.Web3Provider(window.ethereum);
          const accounts = await provider.listAccounts();
          
          if (accounts.length > 0) {
            const signer = provider.getSigner();
            const address = await signer.getAddress();
            const network = await provider.getNetwork();
            
            setWallet({
              address,
              isConnected: true,
              chainId: network.chainId,
              provider,
              signer,
            });
          }
        } catch (error) {
          console.error('Error checking wallet connection:', error);
        }
      }
    };

    checkConnection();
  }, []);

  // Listen for account changes
  useEffect(() => {
    if (!window.ethereum) return;

    const handleAccountsChanged = async (accounts: string[]) => {
      if (accounts.length === 0) {
        // User disconnected
        setWallet({
          address: null,
          isConnected: false,
          chainId: null,
          provider: null,
          signer: null,
        });
      } else if (wallet.isConnected) {
        // Account switched
        try {
          const provider = new ethers.providers.Web3Provider(window.ethereum);
          const signer = provider.getSigner();
          const address = await signer.getAddress();
          
          setWallet(prev => ({
            ...prev,
            address,
            signer,
          }));
        } catch (error) {
          console.error('Error updating wallet after account change:', error);
        }
      }
    };

    const handleChainChanged = (chainId: string) => {
      // Handle chain change by refreshing the page as recommended by MetaMask
      window.location.reload();
    };

    window.ethereum.on('accountsChanged', handleAccountsChanged);
    window.ethereum.on('chainChanged', handleChainChanged);

    return () => {
      if (window.ethereum.removeListener) {
        window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
        window.ethereum.removeListener('chainChanged', handleChainChanged);
      }
    };
  }, [wallet.isConnected]);

  const connectWallet = useCallback(async () => {
    if (!window.ethereum) {
      throw new Error('No Ethereum wallet found. Please install MetaMask or another wallet.');
    }

    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      await provider.send('eth_requestAccounts', []);
      
      const signer = provider.getSigner();
      const address = await signer.getAddress();
      const network = await provider.getNetwork();

      setWallet({
        address,
        isConnected: true,
        chainId: network.chainId,
        provider,
        signer,
      });

      return address;
    } catch (error) {
      console.error('Error connecting wallet:', error);
      throw error;
    }
  }, []);

  const disconnectWallet = useCallback(() => {
    setWallet({
      address: null,
      isConnected: false,
      chainId: null,
      provider: null,
      signer: null,
    });
  }, []);

  const signMessage = useCallback(async (message: string): Promise<string> => {
    if (!wallet.signer) {
      throw new Error('Wallet not connected');
    }

    try {
      return await wallet.signer.signMessage(message);
    } catch (error) {
      console.error('Error signing message:', error);
      throw error;
    }
  }, [wallet.signer]);

  return {
    wallet,
    connectWallet,
    disconnectWallet,
    signMessage,
  };
}
