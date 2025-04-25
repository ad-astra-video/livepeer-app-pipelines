import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { ChatSettings } from '../types';

interface ChatSettingsContextType {
  chatSettings: ChatSettings;
  updateChatSettings: (newSettings: Partial<ChatSettings>) => void;
  saveChatSettings: () => void;
}

const defaultChatSettings: ChatSettings = {
  systemPrompt: "You are a helpful assistant.",
  maxTokens: 1024,
  temperature: 0.7,
  topP: 1.0,
  topK: -1.0,
	stream: false,
  model: "Qwen/Qwen2.5-32B-Instruct"
};

const STORAGE_KEY = 'ethereum-chat-settings-params';

const ChatSettingsContext = createContext<ChatSettingsContextType | undefined>(undefined);

export const ChatSettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [chatSettings, setChatSettings] = useState<ChatSettings>(defaultChatSettings);
  const [initialized, setInitialized] = useState(false);

  // Load settings from localStorage on initial render
  useEffect(() => {
    try {
      const storedSettings = localStorage.getItem(STORAGE_KEY);
      if (storedSettings) {
        const parsedSettings = JSON.parse(storedSettings);
        setChatSettings(prevSettings => ({
          ...prevSettings,
          ...parsedSettings
        }));
      }
    } catch (error) {
      console.error('Failed to load chat settings from localStorage:', error);
    } finally {
      setInitialized(true);
    }
  }, []);

  const updateChatSettings = (newSettings: Partial<ChatSettings>) => {
    setChatSettings(prev => ({ ...prev, ...newSettings }));
  };

  const saveChatSettings = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(chatSettings));
    } catch (error) {
      console.error('Failed to save chat settings to localStorage:', error);
    }
  };

  return (
    <ChatSettingsContext.Provider value={{ chatSettings, updateChatSettings, saveChatSettings }}>
      {children}
    </ChatSettingsContext.Provider>
  );
};

export const useChatSettings = (): ChatSettingsContextType => {
  const context = useContext(ChatSettingsContext);
  if (!context) {
    throw new Error('useChatSettings must be used within a ChatSettingsProvider');
  }
  return context;
};
