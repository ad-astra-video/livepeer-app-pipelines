import { AppSettings, TokenResponse, ChatSettings, Message, SenderAddress, JobPayment } from '../types';
import { ethers } from 'ethers';

// Store token data
let tokenData: TokenResponse | null = null;
let tokenRefreshTimeout: number | null = null;

// Store balance information
let lastBalance: number | null = null;

// Store nonce tracking information
interface NonceTracker {
  [recipientRandHash: string]: number;
}
const nonceTrackers: NonceTracker = {};

// Function to check if token is valid
export const isTokenValid = (ethAddress: string) => {
	if (!tokenData || tokenData.sender_address != ethAddress.toLowerCase()) return false;

  return true;
};

// Function to get current balance
export const getCurrentBalance = (): number | null => {
  return lastBalance;
};

// Function to get signature from wallet
export const getSignature = async (message: string): Promise<string> => {
  try {
    // Check if ethereum is available in window
    if (!window.ethereum) {
      throw new Error('No Ethereum wallet detected. Please install MetaMask or another Ethereum wallet.');
    }

    // Request account access if needed
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    if (!accounts || accounts.length === 0) {
      throw new Error('No Ethereum accounts found. Please connect your wallet.');
    }

    // Create a Web3Provider instance
    const provider = new ethers.providers.Web3Provider(window.ethereum);
    
    // Get the signer
    const signer = provider.getSigner();

		const msgArray = ethers.utils.arrayify(message);
    // Sign the message
    const signature = await signer.signMessage(msgArray);
    
    return signature;
  } catch (error) {
    console.error('Error getting signature:', error);
    throw error;
  }
};

//clean response text
export const cleanMessage = (content: string, tokenCount: number) : string => {
  //some models return user, assistant or userassistant as the first message
  //if the token count is less than 3, we can assume that the token/message can be ignored
  if (tokenCount < 10 && (content == "user" || content == "userassistant" || content == "assistant")) {
    return "";
  }

  if (content.startsWith("user") || content.startsWith("assistant"))  {
      const doubleLineBreakIndex = content.indexOf('\n\n');
      if (doubleLineBreakIndex === -1) {
        return content;
      }
      return content.substring(doubleLineBreakIndex + 2);
  }

  return content;
}

// Function to fetch token using GET request
export const fetchToken = async (settings: AppSettings): Promise<TokenResponse> => {
  try {
    // Hash the Ethereum address using keccak256
    const lowercaseAddress = settings.ethereumAddress.toLowerCase();
    const hashedAddress = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(lowercaseAddress));
    
    // Get signature for the hashed address
    const signature = await getSignature(hashedAddress);

		const addrSigData : SenderAddress = {
			addr: lowercaseAddress,
			sig: signature
		};
		
    const response = await fetch(`${settings.apiBaseUrl}/process/token`, {
      method: 'GET',
      headers: {
        'Livepeer-Job-Eth-Address': encodeToBase64(addrSigData),
        'Livepeer-Job-Capability': settings.capability
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch token: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    // Save token data
    tokenData = data;
    
    // Update balance if available
    if (data.balance !== undefined) {
      lastBalance = data.balance;
      console.log(`Updated balance: ${lastBalance}`);
    }
    
    // Set up refresh timer
    setupTokenRefresh(settings);
    
    return data;
  } catch (error) {
    console.error('Error fetching token:', error);
    throw error;
  }
};

// Function to set up token refresh
const setupTokenRefresh = (settings: AppSettings) => {
  // Clear any existing timeout
  if (tokenRefreshTimeout !== null) {
    window.clearTimeout(tokenRefreshTimeout);
  }
  
  // Set timeout to refresh token after 7 minutes (420000 ms)
  tokenRefreshTimeout = window.setTimeout(async () => {
    try {
      console.log('Refreshing token...');
      await fetchToken(settings);
      console.log('Token refreshed successfully');
    } catch (error) {
      console.error('Failed to refresh token:', error);
    }
  }, 420000); // 7 minutes
};

// Function to clear token data (e.g., on disconnect)
export const clearTokenData = () => {
  tokenData = null;
  lastBalance = null;
  if (tokenRefreshTimeout !== null) {
    window.clearTimeout(tokenRefreshTimeout);
    tokenRefreshTimeout = null;
  }
};

// Helper function to encode JSON to base64
const encodeToBase64 = (obj: any): string => {
  const jsonString = JSON.stringify(obj);
  // Use browser's btoa function to encode to base64
  return btoa(jsonString);
};

// Function to get the next nonce for a recipient_rand_hash
const getNextNonce = (recipientRandHash: string): number => {
  // Initialize nonce to 0 if it doesn't exist
  if (!nonceTrackers[recipientRandHash]) {
    nonceTrackers[recipientRandHash] = 0;
  }
  
  // Increment nonce and return
  nonceTrackers[recipientRandHash]++;
  return nonceTrackers[recipientRandHash];
};

// Function to check if payment is needed
const isPaymentNeeded = (): boolean => {
  if (!tokenData || (lastBalance === null || lastBalance == 0)) {
    // If we don't have enough information, assume payment is needed
    return true;
  }
  
  // Calculate the cost for 60 seconds of usage
  const costFor60Seconds = tokenData.ticket_params.price * 60;
  
  // Payment is needed if the cost for 60 seconds is greater than the last balance
  return costFor60Seconds > lastBalance;
};

// Function to extract balance from response headers
const extractBalanceFromHeaders = (headers: Headers): number | null => {
  const balanceHeader = headers.get('Livepeer-Balance');
  if (balanceHeader) {
    try {
      return parseFloat(balanceHeader);
    } catch (error) {
      console.error('Error parsing balance header:', error);
    }
  }
  return null;
};

// Function to format chat history into the required format for API requests
const formatChatHistory = (chatHistory: Message[], systemPrompt: string) => {
  const formattedMessages = [];
  
  // Add system message if system prompt is provided
  if (systemPrompt) {
    formattedMessages.push({
      role: "system",
      content: systemPrompt
    });
  }
  
  // Add all messages from chat history in chronological order
  chatHistory.forEach(message => {
    formattedMessages.push({
      role: message.isUser ? "user" : "assistant",
      content: message.content
    });
  });

  //add a last message the LLM can put the response in
  formattedMessages.push({
    role: "assistant",
    content: ""
  });
  
  return formattedMessages;
};

export const sendMessage = async (
  settings: AppSettings, 
  newMessage: string, 
  chatSettings: ChatSettings,
  chatHistory: Message[] = [],
  signal: AbortSignal | null = null
) => {
  try {
    // Ensure we have a valid token
    if (!isTokenValid(settings.ethereumAddress)) {
			tokenData = await fetchToken(settings);
			if (tokenData == null) {
				throw new Error('Could not get token to provide payment');
			}
    }
    
    // The request field string that was signed
    const requestField = JSON.stringify({"run": "local chat"});
		const requestParams = JSON.stringify({});
    const hashedJobRequest = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(requestField+requestParams))
    // Sign the request field
    const requestSignature = await getSignature(hashedJobRequest);
    
    // Create and encode the Livepeer-Job header with the signature as the sig field
    const jobData = {
      request: requestField,
      parameters: requestParams,
      capability: settings.capability,
      sender: settings.ethereumAddress,
      sig: requestSignature,
	  timeout_seconds: 300
    };
    
    // Create the Livepeer-Job-Payment header with payment information if needed
    let paymentData: JobPayment = {
      sender: hexToBase64(settings.ethereumAddress.toLowerCase().substring(2)),
      expected_price: tokenData?.price
    };
    
    // Check if we need to include payment information
    if (isPaymentNeeded()) {
      // Prepare payment data
      const recipientRandHash = tokenData?.ticket_params.recipient_rand_hash;
      const nonce = getNextNonce(recipientRandHash);
      
      // Create a message to sign for the ticket
      const ticketSigMsg = await createTicketSigMsg(tokenData?.ticket_params, nonce, settings.ethereumAddress);
      const ticketSignature = await getSignature(ticketSigMsg);
      //create the payment
      paymentData.ticket_params = tokenData?.ticket_params;
      paymentData.expiration_params = tokenData?.ticket_params.expiration_params;
	  paymentData.ticket_sender_params = [
	        {
	          sig: hexToBase64(ticketSignature.toLowerCase().substring(2)),
	          sender_nonce: nonce,
	        },
	      ];
	  paymentData.expected_price = {
	        pricePerUnit: tokenData?.price.pricePerUnit,
	        pixelsPerUnit: tokenData?.price.pixelsPerUnit,
	      };
      
      console.log(`Including payment with nonce ${nonce} for recipient_rand_hash ${recipientRandHash}`);
    }
    
    // Encode both objects to base64
    const livepeerJobHeader = encodeToBase64(jobData);
    const livepeerJobPaymentHeader = encodeToBase64(paymentData);
    
    // Create a temporary array with all existing messages plus the new user message
    const updatedChatHistory = [
      ...chatHistory,
      {
        id: 'temp-user-message',
        content: newMessage,
        isUser: true,
        timestamp: Date.now()
      }
    ];
    
    // Format the complete chat history for the API request
    const messages = formatChatHistory(updatedChatHistory, chatSettings.systemPrompt);
    
    // Prepare request body with chat settings and complete message history
    const requestBody: any = {
      messages: messages,
      model: chatSettings.model || ""
    };
    
    // Add optional parameters if they exist
    if (chatSettings?.maxTokens) {
      requestBody.max_tokens = chatSettings.maxTokens;
    }
    
    if (chatSettings?.temperature !== undefined) {
      requestBody.temperature = chatSettings.temperature;
    }
    
    if (chatSettings?.topP !== undefined) {
      requestBody.top_p = chatSettings.topP;
    }
    
    if (chatSettings?.topK !== undefined) {
      requestBody.top_k = chatSettings.topK;
    }
    
    if (chatSettings?.stream !== undefined) {
      requestBody.stream = chatSettings.stream;
    }
    
    const response = await fetch(`${settings.apiBaseUrl}/process/request${settings.resourceUrlPath}`, {
      method: 'POST',
      signal: signal,
      headers: {
        'Content-Type': 'application/json',
        'Livepeer-Job': livepeerJobHeader,
        'Livepeer-Job-Payment': livepeerJobPaymentHeader,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`Failed to send message: ${response.status} ${response.statusText}`);
    }
    
    // Update balance from response headers if available
    const newBalance = extractBalanceFromHeaders(response.headers);
    if (newBalance !== null) {
      lastBalance = newBalance;
      console.log(`Updated balance from response: ${lastBalance}`);
    }

    return response;
  } catch (error) {
    console.error('Error sending message:', error);
    throw error;
  }
};

// Ticket interface for ticket-related functions
interface Ticket {
  sender_nonce: number;
  sender: string;
  recipient: string;
  face_value: string;
  win_prob: string;
  recipient_rand_hash: string;
  creation_round: number;
  creation_round_block_hash: string;
}

const addressSize = 20;
const uint256Size = 32;
const bytes32Size = 32;

function randomId(length: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function hexToBase64(hexString: string): string {
  if (!hexString) {
    return "";
  }
  // Ensure even length
  if (hexString.length % 2 !== 0) {
    hexString = "0" + hexString;
  }

  // Convert hex to binary string
  const binaryString = hexString.match(/(\w\w)/g)
    .map(hexPair => String.fromCharCode(parseInt(hexPair, 16)))
    .join('');

  // Encode to Base64
  return btoa(binaryString);
}

function base64ToHex(str: string): string {
  const raw = atob(str);
  let result = '';
  for (let i = 0; i < raw.length; i++) {
    const hex = raw.charCodeAt(i).toString(16);
    result += (hex.length === 2 ? hex : '0' + hex);
  }
  return "0x"+result;
}

async function getAuxData(ticket: Ticket): Promise<Uint8Array> {
  const creationRoundBN = ethers.BigNumber.from(ticket.creation_round);
  const creationRoundHex = creationRoundBN.toHexString();
  const creationRoundBytes = ethers.utils.arrayify(creationRoundHex);
  const creationRoundPadded = ethers.utils.zeroPad(creationRoundBytes, uint256Size); // 32 bytes
  
  const creationRoundBlockHashBytes = ethers.utils.arrayify(ticket.creation_round_block_hash); // 32 bytes
  return ethers.utils.concat([creationRoundPadded, creationRoundBlockHashBytes]); // total: 64 bytes
}

async function flatten(ticket: Ticket): Promise<Uint8Array> {
  const recipient = ethers.utils.arrayify(ticket.recipient);
  const sender = ethers.utils.arrayify(ticket.sender);
  const recipientRandHash = ethers.utils.arrayify(ticket.recipient_rand_hash);
  
  const senderNonceBN = ethers.BigNumber.from(ticket.sender_nonce);
  const senderNonceHex = senderNonceBN.toHexString();
  const senderNonceBytes = ethers.utils.arrayify(senderNonceHex);
  const senderNonce = ethers.utils.zeroPad(senderNonceBytes, uint256Size);
  
  const faceValueBytes = ethers.utils.arrayify(ticket.face_value);
  const faceValue = ethers.utils.zeroPad(faceValueBytes, uint256Size);
  
  const winProbBytes = ethers.utils.arrayify(ticket.win_prob);
  const winProb = ethers.utils.zeroPad(winProbBytes, uint256Size);

  const auxData = await getAuxData(ticket);

  const buf = ethers.utils.concat([
    recipient,                       // 20 bytes
    sender,                          // 20 bytes
    faceValue,                       // 32 bytes
    winProb,                         // 32 bytes
    senderNonce,                     // 32 bytes
    recipientRandHash,               // 32 bytes
    auxData                          // 64 bytes
  ]);

  return buf;
}

async function ticketHash(ticket: Ticket): Promise<string> {
  const flat = await flatten(ticket);
  return ethers.utils.keccak256(flat);
}

async function createTicketSigMsg(ticket_params: any, nonce: any, sender: string) {
    const ticketData: Ticket = {
        sender_nonce: nonce,
        sender: sender.toLowerCase(),
        recipient: base64ToHex(ticket_params.recipient),
        face_value: base64ToHex(ticket_params.face_value),
        win_prob: base64ToHex(ticket_params.win_prob),
        recipient_rand_hash: base64ToHex(ticket_params.recipient_rand_hash),
        creation_round: ticket_params.expiration_params.creation_round,
        creation_round_block_hash: base64ToHex(ticket_params.expiration_params.creation_round_block_hash)
    };
    
    return await ticketHash(ticketData);
}
