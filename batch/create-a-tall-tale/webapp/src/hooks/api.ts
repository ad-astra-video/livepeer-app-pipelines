import { useState, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { StreamMessage } from '../types';

export const useSSE = (apiBaseUrl: string) => {
  const [messages, setMessages] = useState<StreamMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPrompt, setCurrentPrompt] = useState('');
  
  // Function to get a story based on a prompt
  const getStoryPrompt = useCallback(async (prompt: string) => {
    // Reset state
    setMessages([{ id: 'initial', content: '' }]);  // Start with an empty message
    setError(null);
    setIsLoading(true);
    setCurrentPrompt(prompt);
    
    const job_req = { 
      "request": JSON.stringify({"run": "gen-story"}),
      "parameters": JSON.stringify({}),
      "capability": "gen-story",
      "timeout_seconds": 600
    };

    console.log('Generating story for prompt:', prompt);

    try {
      // Make API call to create story
      const response = await fetch(`${apiBaseUrl}/process/request/story/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Livepeer': btoa(JSON.stringify(job_req)),
          'Accept': 'text/event-stream'  // Request SSE format
        },
        body: JSON.stringify({ "prompt": prompt }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || `Server responded with status: ${response.status}`);
      }
      
      console.log('Response received, content type:', response.headers.get('Content-Type'));
      
      // Check if the response is a stream
      if (response.headers.get('Content-Type')?.includes('text/event-stream')) {
        console.log('Handling SSE stream response');
        
        // Handle SSE stream
        const reader = response.body?.getReader();
        if (!reader) throw new Error('Response body is not readable');
        
        const decoder = new TextDecoder();
        let buffer = '';
        let accumulatedStory = '';
        
        // Force initial message to be visible
        setMessages([{ id: 'loading', content: 'Loading story...' }]);
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            console.log('Stream complete');
            setIsLoading(false);
            break;
          }
          
          const chunk = decoder.decode(value, { stream: true });
          //console.log('Received chunk:', chunk.length, 'bytes');
          buffer += chunk;
          
          // Process complete events in the buffer
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep the last incomplete line in the buffer
          
          for (const line of lines) {
            if (line.trim() === '') continue;
            
            if (line.startsWith('data: ')) {
              const eventData = line.substring(6);
              
              // Check if this is the end signal
              if (eventData.trim() === '[DONE]') {
                console.log('Received [DONE] signal');
                setIsLoading(false);
                continue;
              }
              
              //check if is balance line
              if (eventData.includes('balance')) {
                console.log('Received balance line:', eventData);
                continue;
              }
              
              try {
                const data = JSON.parse(eventData);
                //console.log('Parsed data:', typeof data, Object.keys(data));
                accumulatedStory += data.choices[0].delta.content || '';
                
                // Make sure we always have content to display
                if (accumulatedStory) {
                  // Use a stable ID to prevent unnecessary re-renders
                  setMessages(prev => {
                    // Make a clean update to avoid any state issues
                    return [{ 
                      id: 'story-content', 
                      content: accumulatedStory 
                    }];
                  });
                }
                
                // Check if this is the final message
                if (data.done) {
                  console.log('Received completion signal from data');
                  setIsLoading(false);
                }
              } catch (e) {
                console.error('Error parsing SSE data:', e, 'Raw data:', eventData.substring(0, 100));
                // Try to still use the data even if parsing fails
                try {
                  const cleanData = eventData.trim();
                  if (cleanData && !cleanData.includes('"[DONE]"')) {
                    accumulatedStory += cleanData;
                    setMessages([{ id: 'story-unparsed', content: accumulatedStory }]);
                  }
                } catch (displayError) {
                  console.error('Failed to display unparseable content', displayError);
                }
              }
            }
          }
        }
        
        // Make sure we have a final state with the complete story
        if (accumulatedStory) {
          console.log('Setting final story content, length:', accumulatedStory.length);
          setMessages([{ id: 'final-story', content: accumulatedStory }]);
        }
      } else {
        console.log('Response is not SSE, handling as regular JSON');
        // Handle regular JSON response
        const data = await response.json();
        if (data.content) {
          setMessages([{ id: 'json-story', content: data.content }]);
        } else {
          throw new Error('Received an empty or invalid response');
        }
        setIsLoading(false);
      }
    } catch (err) {
      console.error('Error generating story:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate story. Please try again.');
      setIsLoading(false);
      
      // Clear any partial content on error
      setMessages([]);
    }
  }, [apiBaseUrl]);
  
  return {
    messages,
    isLoading,
    error,
    getStoryPrompt,
    currentPrompt
  };
};
