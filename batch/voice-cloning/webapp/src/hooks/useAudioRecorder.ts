import { useState, useRef, useCallback } from 'react';

interface AudioRecorderState {
  isRecording: boolean;
  audioBlob: Blob | null;
  audioUrl: string | null;
  duration: number;
  error: string | null;
  isPlaying: boolean;
}

interface AudioRecorderHook extends AudioRecorderState {
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  resetRecording: () => void;
  uploadAudio: (file: File) => void;
  togglePlayback: () => void;
}

export function useAudioRecorder(): AudioRecorderHook {
  const [state, setState] = useState<AudioRecorderState>({
    isRecording: false,
    audioBlob: null,
    audioUrl: null,
    duration: 0,
    error: null,
    isPlaying: false,
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);

  const updateDuration = useCallback(() => {
    if (startTimeRef.current) {
      const currentDuration = (Date.now() - startTimeRef.current) / 1000;
      setState(prev => ({ ...prev, duration: currentDuration }));
    }
  }, []);

  const startRecording = useCallback(async () => {
    try {
      // Reset state
      chunksRef.current = [];
      setState(prev => ({
        ...prev,
        isRecording: true,
        audioBlob: null,
        audioUrl: null,
        duration: 0,
        error: null,
      }));

      // Get media stream
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Create media recorder
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      // Set up event handlers
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      // Start recording
      mediaRecorder.start(100);
      startTimeRef.current = Date.now();
      
      // Start duration timer
      timerRef.current = window.setInterval(updateDuration, 100);
    } catch (error) {
      console.error('Error starting recording:', error);
      setState(prev => ({
        ...prev,
        isRecording: false,
        error: 'Failed to start recording. Please check microphone permissions.'
      }));
    }
  }, [updateDuration]);

  const stopRecording = useCallback(async () => {
    return new Promise<void>((resolve) => {
      if (!mediaRecorderRef.current || !streamRef.current) {
        setState(prev => ({ ...prev, isRecording: false }));
        resolve();
        return;
      }

      // Clear timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      // Handle recording stop
      mediaRecorderRef.current.onstop = () => {
        // Create blob from chunks
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const audioUrl = URL.createObjectURL(audioBlob);

        // Update state
        setState(prev => ({
          ...prev,
          isRecording: false,
          audioBlob,
          audioUrl,
        }));

        // Stop all tracks
        streamRef.current?.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        mediaRecorderRef.current = null;
        
        resolve();
      };

      // Stop recording
      if (mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    });
  }, []);

  const resetRecording = useCallback(() => {
    // Revoke object URL to prevent memory leaks
    if (state.audioUrl) {
      URL.revokeObjectURL(state.audioUrl);
    }

    // Stop audio playback if it's playing
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current.currentTime = 0;
    }

    setState({
      isRecording: false,
      audioBlob: null,
      audioUrl: null,
      duration: 0,
      error: null,
      isPlaying: false,
    });
  }, [state.audioUrl]);

  const uploadAudio = useCallback((file: File) => {
    // Revoke previous URL if exists
    if (state.audioUrl) {
      URL.revokeObjectURL(state.audioUrl);
    }

    // Create new blob and URL
    const audioBlob = file;
    const audioUrl = URL.createObjectURL(audioBlob);

    setState(prev => ({
      ...prev,
      audioBlob,
      audioUrl,
      isRecording: false,
      error: null,
    }));
  }, [state.audioUrl]);

  const togglePlayback = useCallback(() => {
    if (!state.audioUrl) return;

    if (!audioElementRef.current) {
      audioElementRef.current = new Audio(state.audioUrl);
      
      audioElementRef.current.onended = () => {
        setState(prev => ({ ...prev, isPlaying: false }));
      };
      
      audioElementRef.current.onpause = () => {
        setState(prev => ({ ...prev, isPlaying: false }));
      };
    }

    if (state.isPlaying) {
      audioElementRef.current.pause();
      setState(prev => ({ ...prev, isPlaying: false }));
    } else {
      audioElementRef.current.src = state.audioUrl;
      audioElementRef.current.play().catch(error => {
        console.error('Error playing audio:', error);
        setState(prev => ({ 
          ...prev, 
          isPlaying: false,
          error: 'Failed to play audio'
        }));
      });
      setState(prev => ({ ...prev, isPlaying: true }));
    }
  }, [state.audioUrl, state.isPlaying]);

  return {
    ...state,
    startRecording,
    stopRecording,
    resetRecording,
    uploadAudio,
    togglePlayback,
  };
}
