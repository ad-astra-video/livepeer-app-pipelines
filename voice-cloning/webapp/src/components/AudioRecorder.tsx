import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Play, Trash2, Send, Loader2, Upload, Pause, Volume2, Download } from 'lucide-react';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { useWallet } from '../hooks/useWallet';
import { useSettings } from '../hooks/useSettings';
import { getProcessToken, processJob } from '../services/api';
import { TokenResponse } from '../types';

const AudioRecorder: React.FC = () => {
  const { settings } = useSettings();
  const { wallet, signMessage } = useWallet();
  const { 
    isRecording, 
    audioBlob, 
    audioUrl,
    startRecording, 
    stopRecording, 
    resetRecording,
    isPlaying,
    togglePlayback,
    uploadAudio
  } = useAudioRecorder();
  
  const [textPrompt, setTextPrompt] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [processingResult, setProcessingResult] = useState<any>(null);
  const [tokenData, setTokenData] = useState<TokenResponse | null>(null);
  const [isLoadingToken, setIsLoadingToken] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // New states for response audio
  const [responseAudioUrl, setResponseAudioUrl] = useState<string | null>(null);
  const [isResponseAudioPlaying, setIsResponseAudioPlaying] = useState(false);
  const responseAudioRef = useRef<HTMLAudioElement | null>(null);
  
  // Function to get process token
  const fetchProcessToken = async () => {
    if (!wallet.isConnected || !wallet.address) {
      setProcessingError('Please connect your wallet first');
      return null;
    }
    
    setIsLoadingToken(true);
    setProcessingError(null);
    
    try {
      const token = await getProcessToken(
        settings.apiBaseUrl,
        wallet.address,
        signMessage
      );
      setTokenData(token);
      return token;
    } catch (error) {
      console.error('Error getting process token:', error);
      setProcessingError(error instanceof Error ? error.message : 'Failed to get processing token');
      return null;
    } finally {
      setIsLoadingToken(false);
    }
  };
  
  // Effect to get token when audio is ready
  useEffect(() => {
    if (audioBlob && wallet.isConnected && !tokenData && !isLoadingToken) {
      fetchProcessToken();
    }
  }, [audioBlob, wallet.isConnected]);
  
  // Handle file upload
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    // Check file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      setProcessingError('File size exceeds 10MB limit');
      return;
    }
    
    // Check file type
    if (!file.type.startsWith('audio/')) {
      setProcessingError('Please upload an audio file');
      return;
    }
    
    uploadAudio(file);
    setProcessingError(null);
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    
    // Get token after upload if wallet is connected
    if (wallet.isConnected && wallet.address) {
      await fetchProcessToken();
    }
  };
  
  // Handle upload button click
  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };
  
  // Handle recording stop
  const handleStopRecording = async () => {
    await stopRecording();
    
    // Get token after recording if wallet is connected
    if (wallet.isConnected && wallet.address) {
      await fetchProcessToken();
    }
  };
  
  // Reset recording and token
  const handleReset = () => {
    resetRecording();
    setTokenData(null);
    setProcessingResult(null);
    setProcessingError(null);
    setResponseAudioUrl(null);
    
    // Stop response audio if playing
    if (responseAudioRef.current) {
      responseAudioRef.current.pause();
      responseAudioRef.current = null;
    }
    setIsResponseAudioPlaying(false);
  };
  
  // Handle submit for processing
  const handleSubmit = async () => {
    if (!audioBlob) {
      setProcessingError('Please record or upload audio first');
      return;
    }
    
    if (!textPrompt.trim()) {
      setProcessingError('Please enter a text prompt');
      return;
    }
    
    if (!wallet.isConnected || !wallet.address) {
      setProcessingError('Please connect your wallet first');
      return;
    }
    
    setIsProcessing(true);
    setProcessingError(null);
    setProcessingResult(null);
    setResponseAudioUrl(null);
    
    try {
      // Use existing token or get a new one
      const token = tokenData || await fetchProcessToken();
      
      if (!token) {
        throw new Error('Failed to get processing token');
      }
      
      // Process the job with the token
      const result = await processJob(
        settings.apiBaseUrl,
        token,
        audioBlob,
        textPrompt,
        wallet.address,
        signMessage
      );
      
      console.log("API Response:", result);
      setProcessingResult(result);
      
      // Check if result is successful and contains audio data
      if (result && result.success === true) {
        if (result.data && result.data.audio_url) {
          console.log("Setting audio URL from binary response:", result.data.audio_url);
          setResponseAudioUrl(result.data.audio_url);
        }
      } 
      // If the result has a different structure but contains audio_url
      else if (result && result.data && result.data.audio_url) {
        console.log("Setting audio URL from JSON response:", result.data.audio_url);
        setResponseAudioUrl(result.data.audio_url);
      }
      // If we need to search deeper in the response
      else if (typeof result === 'object' && result !== null) {
        // Try to find audio URL in different response formats
        const findAudioUrl = (obj: any): string | null => {
          if (!obj) return null;
          
          // Check if it's directly in the object
          if (obj.audio_url) return obj.audio_url;
          
          // Check if it's in a data property
          if (obj.data && obj.data.audio_url) return obj.data.audio_url;
          
          // Check if it's in a result property
          if (obj.result && obj.result.audio_url) return obj.result.audio_url;
          
          // Check if it's in an output property
          if (obj.output && obj.output.audio_url) return obj.output.audio_url;
          
          // Check if it's in a response property
          if (obj.response && obj.response.audio_url) return obj.response.audio_url;
          
          // Recursively check nested objects
          for (const key in obj) {
            if (typeof obj[key] === 'object' && obj[key] !== null) {
              const nestedUrl = findAudioUrl(obj[key]);
              if (nestedUrl) return nestedUrl;
            }
          }
          
          return null;
        };
        
        const audioUrl = findAudioUrl(result);
        if (audioUrl) {
          console.log("Found audio URL in nested response:", audioUrl);
          setResponseAudioUrl(audioUrl);
        } else {
          console.warn("No audio URL found in response:", result);
          
          // Check if there was an error
          if (result.success === false || (result.status && result.status >= 400)) {
            const errorMessage = result.error || 'Error processing voice clone request';
            setProcessingError(typeof errorMessage === 'string' ? errorMessage : JSON.stringify(errorMessage));
          }
        }
      }
    } catch (error) {
      console.error('Error processing voice clone:', error);
      setProcessingError(error instanceof Error ? error.message : 'Unknown error occurred');
    } finally {
      setIsProcessing(false);
    }
  };
  
  // Toggle response audio playback
  const toggleResponseAudio = () => {
    if (!responseAudioUrl) {
      console.error("No response audio URL available");
      return;
    }
    
    console.log("Toggling audio playback for URL:", responseAudioUrl);
    
    if (!responseAudioRef.current) {
      responseAudioRef.current = new Audio(responseAudioUrl);
      
      responseAudioRef.current.onended = () => {
        console.log("Audio playback ended");
        setIsResponseAudioPlaying(false);
      };
      
      responseAudioRef.current.onpause = () => {
        console.log("Audio playback paused");
        setIsResponseAudioPlaying(false);
      };
      
      responseAudioRef.current.onerror = (e) => {
        console.error("Audio playback error:", e);
        setProcessingError('Failed to play response audio');
        setIsResponseAudioPlaying(false);
      };
    }
    
    if (isResponseAudioPlaying) {
      console.log("Pausing audio");
      responseAudioRef.current.pause();
      setIsResponseAudioPlaying(false);
    } else {
      console.log("Playing audio");
      responseAudioRef.current.src = responseAudioUrl;
      responseAudioRef.current.play().catch(error => {
        console.error('Error playing response audio:', error);
        setProcessingError('Failed to play response audio: ' + (error.message || 'Unknown error'));
        setIsResponseAudioPlaying(false);
      });
      setIsResponseAudioPlaying(true);
    }
  };
  
  // Handle download of response audio
  const handleDownloadAudio = () => {
    if (!responseAudioUrl) {
      console.error("No response audio URL available for download");
      return;
    }
    
    console.log("Downloading audio from URL:", responseAudioUrl);
    
    // Create an anchor element and set the download attribute
    const a = document.createElement('a');
    a.href = responseAudioUrl;
    a.download = 'cloned-voice.wav'; // Use .wav extension for WAV files
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };
  
  // Check if response is successful and has audio
  const isResponseSuccessful = !!responseAudioUrl;
  
  // Check if response has an error
  const hasResponseError = !!processingError || 
    (processingResult && 
     ((processingResult.success === false) || 
      (processingResult.status && processingResult.status >= 400)));
  
  // Debug output for response state
  useEffect(() => {
    console.log("Response state updated:", {
      responseAudioUrl,
      isResponseSuccessful,
      hasResponseError,
      processingResult: processingResult ? typeof processingResult : 'none'
    });
  }, [responseAudioUrl, isResponseSuccessful, hasResponseError, processingResult]);
  
  return (
    <div className="p-4 bg-white rounded-lg shadow-md">
      <div className="mb-4">
        <div className="flex justify-center space-x-4 mb-4">
          {!isRecording && !audioBlob && (
            <>
              <button
                onClick={startRecording}
                className="bg-red-500 hover:bg-red-600 text-white p-3 rounded-full"
                aria-label="Start recording"
              >
                <Mic size={24} />
              </button>
              
              <button
                onClick={handleUploadClick}
                className="bg-blue-500 hover:bg-blue-600 text-white p-3 rounded-full"
                aria-label="Upload audio"
              >
                <Upload size={24} />
              </button>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept="audio/*"
                className="hidden"
              />
            </>
          )}
          
          {isRecording && (
            <button
              onClick={handleStopRecording}
              className="bg-gray-500 hover:bg-gray-600 text-white p-3 rounded-full"
              aria-label="Stop recording"
            >
              <Square size={24} />
            </button>
          )}
          
          {audioBlob && !isRecording && (
            <>
              <button
                onClick={togglePlayback}
                className="bg-blue-500 hover:bg-blue-600 text-white p-3 rounded-full"
                aria-label={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? <Pause size={24} /> : <Play size={24} />}
              </button>
              
              <button
                onClick={handleReset}
                className="bg-gray-500 hover:bg-gray-600 text-white p-3 rounded-full"
                aria-label="Delete recording"
              >
                <Trash2 size={24} />
              </button>
            </>
          )}
        </div>
        
        {isRecording && (
          <div className="text-center text-red-500 animate-pulse">
            Recording...
          </div>
        )}
        
        {audioBlob && !isRecording && (
          <div className="text-center text-green-500">
            {audioUrl ? 'Audio ready' : 'Recording complete'}
          </div>
        )}
        
        {isLoadingToken && (
          <div className="text-center text-blue-500 flex items-center justify-center mt-2">
            <Loader2 size={16} className="mr-2 animate-spin" />
            Getting processing token...
          </div>
        )}
        
        {tokenData && (
          <div className="text-center text-green-500 mt-2">
            Processing token ready
          </div>
        )}
      </div>
      
      <div className="mb-4">
        <label htmlFor="textPrompt" className="block text-sm font-medium text-gray-700 mb-1">
          Text Prompt
        </label>
        <textarea
          id="textPrompt"
          value={textPrompt}
          onChange={(e) => setTextPrompt(e.target.value)}
          className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
          rows={3}
          placeholder="Enter text for the cloned voice to say..."
          disabled={isProcessing}
        />
      </div>
      
      <div className="flex justify-center space-x-2">
        <button
          onClick={handleSubmit}
          disabled={!audioBlob || !textPrompt.trim() || isProcessing || !wallet.isConnected}
          className={`flex items-center justify-center px-4 py-2 rounded-md ${
            !audioBlob || !textPrompt.trim() || isProcessing || !wallet.isConnected
              ? 'bg-gray-300 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700 text-white'
          }`}
        >
          {isProcessing ? (
            <>
              <Loader2 size={18} className="mr-2 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Send size={18} className="mr-2" />
              Process Voice Clone
            </>
          )}
        </button>
        
        {/* Play Response Audio Button */}
        <button
          onClick={toggleResponseAudio}
          disabled={!isResponseSuccessful}
          className={`flex items-center justify-center px-4 py-2 rounded-md ${
            !isResponseSuccessful
              ? 'bg-gray-300 cursor-not-allowed'
              : 'bg-green-600 hover:bg-green-700 text-white'
          }`}
          aria-label={isResponseAudioPlaying ? "Pause response audio" : "Play response audio"}
        >
          {isResponseAudioPlaying ? (
            <Pause size={18} />
          ) : (
            <Volume2 size={18} />
          )}
        </button>
        
        {/* Download Response Audio Button */}
        <button
          onClick={handleDownloadAudio}
          disabled={!isResponseSuccessful}
          className={`flex items-center justify-center px-4 py-2 rounded-md ${
            !isResponseSuccessful
              ? 'bg-gray-300 cursor-not-allowed'
              : 'bg-purple-600 hover:bg-purple-700 text-white'
          }`}
          aria-label="Download response audio"
        >
          <Download size={18} />
        </button>
      </div>
      
      {hasResponseError && (
        <div className="mt-4 p-3 bg-red-100 text-red-700 rounded-md">
          {processingError || (processingResult && processingResult.error) || 'Error processing voice clone request'}
        </div>
      )}
      
      {processingResult && isResponseSuccessful && (
        <div className="mt-4 p-3 bg-green-100 text-green-700 rounded-md">
          <h3 className="font-bold mb-2">Processing Result:</h3>
          <p>Voice cloning successful! Use the buttons above to play or download the cloned voice.</p>
        </div>
      )}
      
      {processingResult && !isResponseSuccessful && !hasResponseError && (
        <div className="mt-4 p-3 bg-yellow-100 text-yellow-700 rounded-md">
          <h3 className="font-bold mb-2">Processing Result:</h3>
          <pre className="text-xs overflow-auto max-h-40">
            {JSON.stringify(processingResult, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};

export default AudioRecorder;
