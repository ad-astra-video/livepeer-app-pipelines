import { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Message } from './types';
import ChatInput from './components/ChatInput';
import ChatHistory from './components/ChatHistory';
import Header from './components/Header';
import SettingsModal from './components/SettingsModal';
import NotificationContainer from './components/NotificationContainer';
import { useSettings } from './context/SettingsContext';
import { useChatSettings } from './context/ChatSettingsContext';
import { fetchToken, sendMessage, clearTokenData, isTokenValid, cleanMessage } from './services/api';
import { ARBITRUM_CHAIN_ID, ARBITRUM_NETWORK } from './types';

// Define notification type
interface Notification {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const { settings, updateSettings } = useSettings();
  const { chatSettings } = useChatSettings();

  // Add notification helper
  const addNotification = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = uuidv4();
    setNotifications(prev => [...prev, { id, message, type }]);
  }, []);

  // Remove notification helper
  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(notification => notification.id !== id));
  }, []);

  // Check if wallet is connected on initial load
  useEffect(() => {
    const checkConnection = async () => {
      if (window.ethereum) {
        try {
          const accounts = await window.ethereum.request({ method: 'eth_accounts' });
          if (accounts.length > 0) {
            updateSettings({ ethereumAddress: accounts[0] });
            setIsConnected(true);
          }
        } catch (error) {
          console.error('Error checking wallet connection:', error);
        }
      }
    };

    checkConnection();
  }, [updateSettings]);

  // Listen for account changes
  useEffect(() => {
    if (window.ethereum) {
      const handleAccountsChanged = (accounts: string[]) => {
        if (accounts.length === 0) {
          // User disconnected wallet
          setIsConnected(false);
          updateSettings({ ethereumAddress: '' });
          clearTokenData();
          addNotification('Wallet disconnected', 'info');
        } else {
          // User switched account
          setIsConnected(true);
          updateSettings({ ethereumAddress: accounts[0] });
          addNotification(`Connected to ${accounts[0].substring(0, 6)}...${accounts[0].substring(accounts[0].length - 4)}`, 'success');
        }
      };

      window.ethereum.on('accountsChanged', handleAccountsChanged);

      return () => {
        window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
      };
    }
  }, [updateSettings, addNotification]);

  // Connect wallet function - no signature request here
  const connectWallet = useCallback(async () => {
    if (window.ethereum) {
      try {
        setIsLoading(true);
        setNetworkError(null);
        
        // Check if we're on the right network
        const chainId = await window.ethereum.request({ method: 'eth_chainId' });
        
        if (chainId !== ARBITRUM_CHAIN_ID) {
          try {
            // Try to switch to Arbitrum
            await window.ethereum.request({
              method: 'wallet_switchEthereumChain',
              params: [{ chainId: ARBITRUM_CHAIN_ID }],
            });
          } catch (switchError: any) {
            // This error code indicates that the chain has not been added to MetaMask
            if (switchError.code === 4902) {
              try {
                await window.ethereum.request({
                  method: 'wallet_addEthereumChain',
                  params: [ARBITRUM_NETWORK],
                });
              } catch (addError) {
                console.error('Error adding Arbitrum network:', addError);
                setNetworkError('Failed to add Arbitrum network');
                addNotification('Failed to add Arbitrum network', 'error');
                setIsLoading(false);
                return;
              }
            } else {
              console.error('Error switching to Arbitrum network:', switchError);
              setNetworkError('Failed to switch to Arbitrum network');
              addNotification('Failed to switch to Arbitrum network', 'error');
              setIsLoading(false);
              return;
            }
          }
        }
        
        // Request accounts
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        updateSettings({ ethereumAddress: accounts[0] });
        setIsConnected(true);
        addNotification(`Connected to ${accounts[0].substring(0, 6)}...${accounts[0].substring(accounts[0].length - 4)}`, 'success');
        setIsLoading(false);
      } catch (error) {
        console.error('Error connecting wallet:', error);
        addNotification('Failed to connect wallet', 'error');
        setIsLoading(false);
      }
    } else {
      addNotification('Please install MetaMask or another Ethereum wallet', 'error');
    }
  }, [updateSettings, addNotification]);

  // Disconnect wallet function
  const disconnectWallet = useCallback(() => {
    setIsConnected(false);
    updateSettings({ ethereumAddress: '' });
    clearTokenData();
    addNotification('Wallet disconnected', 'info');
  }, [updateSettings, addNotification]);

  
  // Handle sending a message
  const handleSendMessage = async (content: string) => {
    if (!content.trim() || !isConnected) return;
       
    // Add user message to chat
    const userMessage: Message = {
      id: uuidv4(),
      content,
      isUser: true,
      timestamp: Date.now(),
    };
    
    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    
    try {
      // Create an instance.
      const controller = new AbortController()
      const signal = controller.signal
      // Send message to API with complete chat history
      const response = await sendMessage(settings, content, chatSettings, messages, signal);

      // Check if response is a streaming response
      const contentType = response.headers.get("content-type") || "";
      
      if (contentType.includes("text/event-stream")) {
        const reader = response.body?.getReader();
        const decoder = new TextDecoder("utf-8");
        
        // Create initial AI message and add it to the chat
        const aiMessage: Message = {
          id: uuidv4(),
          content: "",
          isUser: false,
          timestamp: Date.now(),
        };

        setMessages(prev => [...prev, aiMessage]);

        // Update the last message with streamed chunks
        let done = false;
        while (!done && reader) {
          const { value, done: streamDone } = await reader.read();
          done = streamDone;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n").filter(line => line.trim() !== "");

          for (const line of lines) {
          if (line.startsWith("data:")) {
            if (line.includes("[DONE]")) {
              console.log("Stream finished");
              controller.abort();
              done = true;
              break;
            }
            const json = line.replace("data: ", "");
            
            try {
              const parsed = JSON.parse(json);
              const delta = cleanMessage(parsed.choices?.[0]?.delta?.content, parsed.usage?.completion_tokens);
              if (delta) {
                setMessages(prev => {
                const updated = [...prev];
                const lastIndex = updated.length - 1;
                updated[lastIndex] = {
                  ...updated[lastIndex],
                  content: updated[lastIndex].content + delta,
                };
                return updated;
                });
              }
              
              if (parsed.choices?.[0]?.finish_reason === "stop") {
                console.log("Stream finished");
                controller.abort();
                done = true;
                
                // Trim the content of the last message
                setMessages(prev => {
                  const updated = [...prev];
                  const lastIndex = updated.length - 1;
                  updated[lastIndex] = {
                    ...updated[lastIndex],
                    content: updated[lastIndex].content.trim(),
                  };
                  return updated;
                });

                break;
              }
            } catch (err) {
            console.error("Error parsing stream JSON:", err);
            }
          }
          }
        }
      } else {
        // Fallback for non-streaming response
        const json = await response.json();
        const msg = cleanMessage(json.choices[0].message.content, json.usage.completion_tokens);
        const aiMessage: Message = {
          id: uuidv4(),
          content: msg,
          isUser: false,
          timestamp: Date.now(),
        };

        setMessages(prev => [...prev, aiMessage]);
      }
	} catch (error) {
      console.error('Error sending message:', error);
      addNotification('Failed to send message', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <NotificationContainer 
        notifications={notifications} 
        onDismiss={removeNotification} 
      />
      
      <Header 
        isConnected={isConnected}
        onConnect={connectWallet}
        disconnectWallet={disconnectWallet}
        onOpenSettings={() => setIsSettingsOpen(true)}
        address={settings.ethereumAddress}
        isLoading={isLoading}
        networkError={networkError}
      />
      
      <main className="flex-1 flex flex-col p-4 max-w-4xl mx-auto w-full">
        <ChatHistory messages={messages} />
        
        <div className="mt-auto pt-4">
          <ChatInput 
            onSendMessage={handleSendMessage} 
            isConnected={isConnected}
            isLoading={isLoading}
          />
        </div>
      </main>
      
      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
      />
    </div>
  );
};

export default App;
