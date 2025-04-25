export interface AppSettings {
  ethereumAddress: string;
  apiBaseUrl: string;
  capability: string;
  resourceUrlPath: string;
}

export interface SenderAddress {
	addr: string,
	sig: string
}

export interface TokenResponse {
  sender_address: any;
  balance: number;
  ticket_params?: any;
  price: any;
}

export interface JobPayment {
  sender: string;
  expected_price: {
    pricePerUnit: number;
    pixelsPerUnit: number;
  };
  ticket_params?: any;
  
  expiration_params?: any;
  ticket_sender_params?: any[];
  
}
export interface ChatSettings {
  systemPrompt: string;
  maxTokens: number;
  temperature: number;
  topP: number;
  topK: number;
  stream: boolean;
  model: string;
}

export interface Message {
  id: string;
  content: string;
  isUser: boolean;
  timestamp: number;
}

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  duration?: number;
}

// Chain ID constants
export const ARBITRUM_CHAIN_ID = '0xa4b1';

// Network constants
export const ARBITRUM_NETWORK = {
  chainId: ARBITRUM_CHAIN_ID,
  chainName: 'Arbitrum One',
  nativeCurrency: {
    name: 'Ethereum',
    symbol: 'ETH',
    decimals: 18
  },
  rpcUrls: ['https://arb1.arbitrum.io/rpc'],
  blockExplorerUrls: ['https://arbiscan.io/']
};

// Add ethereum to window object for TypeScript
declare global {
  interface Window {
    ethereum: any;
  }
}
