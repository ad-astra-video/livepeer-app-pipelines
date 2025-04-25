import { TokenResponse, ProcessJobRequest, JobPayment, SignatureData, TicketParamsTracker, Ticket } from '../types';
import { ethers } from 'ethers';

// Capability is still a constant as it doesn't change
const CAPABILITY = 'voice-clone';

// Store signature in memory for the session
let cachedSignature: string | null = null;

// Track ticket params by their hash
const ticketParamsTrackers: Record<string, TicketParamsTracker> = {};

// Interval ID for expiration checking
let expirationCheckIntervalId: number | null = null;

export function getCachedSignature(): string | null {
  return cachedSignature;
}

export function setCachedSignature(signature: string): void {
  cachedSignature = signature;
}

// Hash ticket params to create a unique identifier
function hashTicketParams(ticketParams: any): string {
  const paramsString = JSON.stringify(ticketParams);
  return ethers.utils.keccak256(ethers.utils.toUtf8Bytes(paramsString));
}

// Get or create a tracker for ticket params
function getTicketParamsTracker(ticketParams: any): TicketParamsTracker {
  const hash = hashTicketParams(ticketParams);
  
  if (!ticketParamsTrackers[hash]) {
    ticketParamsTrackers[hash] = {
      ticketParams,
      nonce: 0,
      expirationBlock: ticketParams.expiration_params?.expiration_block || null,
      lastUsed: Date.now()
    };
  }
  
  return ticketParamsTrackers[hash];
}

// Increment nonce for ticket params and return the new value
function incrementNonce(ticketParams: any): number {
  const tracker = getTicketParamsTracker(ticketParams);
  // Increment nonce as a 32-bit integer (wrap around at 2^32)
  tracker.nonce = (tracker.nonce + 1) & 0xFFFFFFFF;
  tracker.lastUsed = Date.now();
  return tracker.nonce;
}

// Start checking for expired ticket params
export function startExpirationChecking(provider: ethers.providers.Provider): void {
  // Clear any existing interval
  if (expirationCheckIntervalId !== null) {
    clearInterval(expirationCheckIntervalId);
  }
  
  // Check every 12 seconds
  expirationCheckIntervalId = window.setInterval(async () => {
    try {
      // Get current block number
      const currentBlock = await provider.getBlockNumber();
      
      // Check each tracker
      Object.keys(ticketParamsTrackers).forEach(hash => {
        const tracker = ticketParamsTrackers[hash];
        
        // Skip if no expiration block
        if (!tracker.expirationBlock) return;
        
        try {
          // Convert expiration block from bytes to BigNumber
          let expirationBlockBN: ethers.BigNumber;
          
          if (typeof tracker.expirationBlock === 'string') {
            // If it's a hex string
            expirationBlockBN = ethers.BigNumber.from(tracker.expirationBlock);
          } else if (Array.isArray(tracker.expirationBlock)) {
            // If it's a byte array
            expirationBlockBN = ethers.BigNumber.from(tracker.expirationBlock);
          } else {
            // If it's already a number or BigNumber
            expirationBlockBN = ethers.BigNumber.from(tracker.expirationBlock);
          }
          
          // Check if expired
          if (expirationBlockBN.lte(currentBlock)) {
            console.log(`Ticket params expired at block ${expirationBlockBN.toString()}, current block: ${currentBlock}`);
            delete ticketParamsTrackers[hash];
          }
        } catch (error) {
          console.error('Error checking expiration block:', error);
        }
      });
    } catch (error) {
      console.error('Error in expiration checking:', error);
    }
  }, 12000);
}

// Stop checking for expired ticket params
export function stopExpirationChecking(): void {
  if (expirationCheckIntervalId !== null) {
    clearInterval(expirationCheckIntervalId);
    expirationCheckIntervalId = null;
  }
}

export async function getProcessToken(
  baseUrl: string, 
  ethAddress: string,
  signMessage: (message: string) => Promise<string>
): Promise<TokenResponse> {
  try {
    // Convert the address to lowercase before hashing
    const lowercaseAddress = ethAddress.toLowerCase();
    
    // Create the signature data object with the original address
    const signatureData: SignatureData = {
      addr: lowercaseAddress,
      sig: ''
    };
    
    // Hash the lowercase address with Keccak256 before signing
    const hashedAddress = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(lowercaseAddress));
    
    // Sign the hashed address with the wallet
    let signature: string;
    
    // Use cached signature if available
    if (cachedSignature) {
      signature = cachedSignature;
    } else {
      try {
        // Sign the hashed ethereum address
        signature = await signMessage(ethers.utils.arrayify(hashedAddress));
        // Cache the signature for future use
        setCachedSignature(signature);
      } catch (signError) {
        console.error('Error signing message:', signError);
        throw new Error('Failed to sign the request with your wallet');
      }
    }

    // Add signature to the data object
    signatureData.sig = signature;

    // Base64 encode the signature data
    const encodedSignatureData = btoa(JSON.stringify(signatureData));

    // Make the API request with the encoded signature data
    const response = await fetch(`${baseUrl}/process/token`, {
      method: 'GET',
      headers: {
        'Livepeer-Job-Eth-Address': encodedSignatureData,
        'Livepeer-Job-Capability': CAPABILITY,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get token: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error getting process token:', error);
    throw error;
  }
}

export async function processJob(
  baseUrl: string,
  tokenData: TokenResponse,
  audioBlob: Blob,
  textPrompt: string,
  ethAddress: string,
  signMessage: (message: string) => Promise<string>
): Promise<any> {
  try {
    // Create form data with audio and text
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.webm');
    formData.append('text', textPrompt);

    // Prepare job request without signature first
    const jobRequest: ProcessJobRequest = {
      id: randomId(10),
      request: JSON.stringify({"run": "voice-clone"}), // Add request instructions (required)
      parameters: JSON.stringify({}),                  // Add any specific parameters if needed
      capability: CAPABILITY,
      sender: ethAddress,
      timeout_seconds: 300, // 5 minutes timeout
    };

    // Convert to JSON string for signing
    const jobRequestString = jobRequest.request+jobRequest.parameters;
    
    // Hash the job request string with Keccak256 before signing
    const hashedJobRequest = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(jobRequestString));
    
    // Get signature from wallet
    let signature;
    try {
      signature = await signMessage(ethers.utils.arrayify(hashedJobRequest));
    } catch (signError) {
      console.error('Error signing message:', signError);
      throw new Error('Failed to sign the request with your wallet');
    }

    // Add signature to job request
    jobRequest.sig = signature;

    // Get the next nonce for these ticket params
    const nonce = incrementNonce(tokenData.ticket_params);
    
    // Create a message to sign for the ticket
    const ticketSigMsg = await createTicketSigMsg(tokenData.ticket_params, nonce, ethAddress);
    
    // Sign the ticket message
    let ticketSignature;
    try {
      ticketSignature = await signMessage(ethers.utils.arrayify(ticketSigMsg));
    } catch (signError) {
      console.error('Error signing ticket message:', signError);
      throw new Error('Failed to sign the ticket with your wallet');
    }

    // Prepare payment data
    const senderBytes = ethers.utils.arrayify(ethAddress);
    const paymentData: JobPayment = {
      ticket_params: tokenData.ticket_params,
      sender: hexToBase64(ethAddress.toLowerCase().substring(2)),
      expiration_params: tokenData.ticket_params.expiration_params,
      ticket_sender_params: [
        {
          sig: hexToBase64(ticketSignature.toLowerCase().substring(2)),
          sender_nonce: nonce,
        },
      ],
      expected_price: {
        pricePerUnit: tokenData.price.pricePerUnit,
        pixelsPerUnit: tokenData.price.pixelsPerUnit,
      },
    };

    // Base64 encode the headers
    const jobHeader = btoa(JSON.stringify(jobRequest));
    const paymentHeader = btoa(JSON.stringify(paymentData));

    const response = await fetch(`${baseUrl}/process/request`, {
      method: 'POST',
      headers: {
        'Livepeer-Job': jobHeader,
        'Livepeer-Job-Payment': paymentHeader,
      },
      body: formData,
    });

    // Check if response is successful (status 200-299)
    if (response.ok) {
      // Check the content type to determine how to handle the response
      const contentType = response.headers.get('content-type');
      
      // If it's a WAV file (audio/wav or audio/x-wav)
      if (contentType && (contentType.includes('audio/wav') || contentType.includes('audio/x-wav'))) {
        console.log('Received binary WAV data response');
        
        // Get the binary data as a blob
        const audioBlob = await response.blob();
        
        // Create an object URL for the blob
        const audioUrl = URL.createObjectURL(audioBlob);
        
        // Return an object with the audio URL and blob
        return {
          success: true,
          status: response.status,
          data: {
            audio_url: audioUrl,
            audio_blob: audioBlob
          }
        };
      } 
      // If it's JSON
      else if (contentType && contentType.includes('application/json')) {
        console.log('Received JSON response');
        const jsonData = await response.json();
        return jsonData;
      } 
      // For any other content type
      else {
        console.log('Received response with content-type:', contentType);
        
        // Try to get as blob anyway
        try {
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          
          return {
            success: true,
            status: response.status,
            data: {
              audio_url: url,
              audio_blob: blob,
              content_type: contentType
            }
          };
        } catch (blobError) {
          console.error('Error converting response to blob:', blobError);
          
          // Fallback to text
          const text = await response.text();
          return {
            success: true,
            status: response.status,
            data: text,
            content_type: contentType
          };
        }
      }
    } else {
      // For error responses, try to parse as JSON first
      try {
        const errorJson = await response.json();
        return {
          success: false,
          status: response.status,
          error: errorJson
        };
      } catch (jsonError) {
        // If not JSON, get as text
        const errorText = await response.text();
        return {
          success: false,
          status: response.status,
          error: errorText
        };
      }
    }
  } catch (error) {
    console.error('Error processing job:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}


const addressSize = 20;
const uint256Size = 32;
const bytes32Size = 32;

function randomId(length) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}


function hexToBase64(hexString) {
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

function base64ToHex(str) {
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
