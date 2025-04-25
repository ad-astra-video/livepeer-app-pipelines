import React, { useState } from 'react';
import { Send, Sliders } from 'lucide-react';
import { useSettings } from '../context/SettingsContext';
import ChatSettingsModal from './ChatSettingsModal';

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  isConnected: boolean;
  isLoading?: boolean;
}

const ChatInput: React.FC<ChatInputProps> = ({ onSendMessage, isConnected, isLoading = false }) => {
  const [message, setMessage] = useState('');
  const [isChatSettingsOpen, setIsChatSettingsOpen] = useState(false);
  const { settings } = useSettings();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim() && isConnected && !isLoading) {
      onSendMessage(message);
      setMessage('');
    }
  };

  return (
    <>
      <div className="sticky bottom-0 bg-inherit z-100">
        <form onSubmit={handleSubmit} className="w-full max-w-3xl mx-auto">
          <div className="relative bg-white">
            <button
              type="button"
              onClick={() => setIsChatSettingsOpen(true)}
              className="absolute left-4 bottom-4 p-2 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600"
              title="Chat Settings"
            >
              <Sliders size={20} />
            </button>
            
            <textarea
              className="w-full p-4 pl-16 pr-16 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none h-24"
              placeholder={
                !isConnected 
                  ? "Connect wallet to chat..." 
                  : isLoading 
                    ? "Processing..." 
                    : "Type your message..."
              }
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={!isConnected || isLoading}
            />
            
            <button
              type="submit"
              className={`absolute right-4 bottom-4 p-2 rounded-full ${
                isConnected && message.trim() && !isLoading
                  ? 'bg-blue-500 hover:bg-blue-600 text-white' 
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
              disabled={!isConnected || !message.trim() || isLoading}
            >
              <Send size={20} />
            </button>
          </div>
        </form>
      </div>
      
      {isChatSettingsOpen && (
        <ChatSettingsModal 
          isOpen={isChatSettingsOpen} 
          onClose={() => setIsChatSettingsOpen(false)} 
        />
      )}
    </>
  );
};

export default ChatInput;
