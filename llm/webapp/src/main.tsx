import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { SettingsProvider } from './context/SettingsContext.tsx'
import { ChatSettingsProvider } from './context/ChatSettingsContext.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SettingsProvider>
      <ChatSettingsProvider>
        <App />
      </ChatSettingsProvider>
    </SettingsProvider>
  </StrictMode>,
)
