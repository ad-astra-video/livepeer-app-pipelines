export interface TokenResponse {
  sender_address: any;
  ticket_params: any;
  balance: any;
  price: any;
}

export interface ProcessJobRequest {
  id: string;
  request: any;
  parameters: any;
  capability: string;
  timeout_seconds: number;
  sender: string;
  sig: string;
}

export interface JobPayment {
  ticket_params: any;
  sender: string;
  expiration_params: any;
  ticket_sender_params: any[];
  expected_price: {
    pricePerUnit: number;
    pixelsPerUnit: number;
  };
}

export interface SignatureData {
  addr: string;
  sig: string;
}

export interface WalletState {
  address: string | null;
  isConnected: boolean;
  chainId: number | null;
  provider: any;
  signer: any;
}

export interface Ticket {
  sender_nonce: any;
  recipient: any;              // from ticket_params
  sender: any;                 // from ticket_params
  face_value: any;              // from ticket_params
  win_prob: any;                // from ticket_params
  recipient_rand_hash: any;      // from ticket_params
  creation_round: any;          // from ticket_params
  creation_round_block_hash: any; // from ticket_params
}

export interface TicketParamsTracker {
  ticketParams: any;
  nonce: number;
  expirationBlock: any;
  lastUsed: number;
}
