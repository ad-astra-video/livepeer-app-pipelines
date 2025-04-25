import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { AppSettings } from '../types';

interface SettingsContextType {
  settings: AppSettings;
  updateSettings: (newSettings: Partial<AppSettings>) => void;
  saveSettings: () => void;
}

const defaultSettings: AppSettings = {
  apiBaseUrl: 'https://api.example.com',
  ethereumAddress: '',
  capability: 'llm-generate',
	resourceUrlPath: ''
};

const STORAGE_KEY = 'local-chat-settings';

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [initialized, setInitialized] = useState(false);

  // Load settings from localStorage on initial render
  useEffect(() => {
    try {
      const storedSettings = localStorage.getItem(STORAGE_KEY);
      if (storedSettings) {
        const parsedSettings = JSON.parse(storedSettings);
        // Ensure ethereumAddress is always empty on initial load
        const sanitizedSettings = {
          ...parsedSettings,
          ethereumAddress: ''
        };
        setSettings(prevSettings => ({
          ...prevSettings,
          ...sanitizedSettings
        }));
      }
    } catch (error) {
      console.error('Failed to load settings from localStorage:', error);
    } finally {
      setInitialized(true);
    }
  }, []);

  const updateSettings = (newSettings: Partial<AppSettings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  };

  const saveSettings = () => {
    try {
      // Save all settings except ethereumAddress
      const settingsToSave = {
        ...settings,
        ethereumAddress: '' // Always save with empty ethereumAddress
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settingsToSave));
    } catch (error) {
      console.error('Failed to save settings to localStorage:', error);
    }
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, saveSettings }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = (): SettingsContextType => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};
