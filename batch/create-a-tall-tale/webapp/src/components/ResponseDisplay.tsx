import React, { useRef, useEffect } from 'react';
import { StreamMessage } from '../types';

interface ResponseDisplayProps {
  messages: StreamMessage[];
  isLoading: boolean;
  currentPrompt: string;
}

const ResponseDisplay: React.FC<ResponseDisplayProps> = ({ messages, isLoading, currentPrompt }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages]);

  if (messages.length === 0 && !isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6 h-96 flex items-center justify-center">
        <div className="text-gray-500 text-center">
          Select a story category to generate a story
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className="bg-white rounded-lg shadow-md p-6 h-96 overflow-y-auto"
    >
      {currentPrompt && (
        <div className="mb-4 p-3 bg-gray-100 rounded-md">
          <div className="text-sm text-gray-500 mb-1">Prompt:</div>
          <div className="text-sm text-gray-700">{currentPrompt}</div>
        </div>
      )}
      
      {messages.map((message, index) => (
        <div key={message.id || index} className="mb-4">
          <div className="whitespace-pre-wrap text-gray-800" dangerouslySetInnerHTML={{ __html: message.content.replace(/\n/g, '<br/>') }} />
        </div>
      ))}
      
      {isLoading && (
        <div className="flex items-center space-x-2 text-gray-500">
          <div className="animate-pulse">●</div>
          <div className="animate-pulse animation-delay-200">●</div>
          <div className="animate-pulse animation-delay-400">●</div>
        </div>
      )}
    </div>
  );
};

export default ResponseDisplay;
