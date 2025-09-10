import React, { useEffect, RefObject } from 'react';
import { StreamMessage } from '../types';
import ReactMarkdown from 'react-markdown';

interface StoryDisplayProps {
  messages: StreamMessage[];
  isLoading: boolean;
  error: string | null;
  currentPrompt: string;
  containerRef: RefObject<HTMLDivElement>;
}

const StoryDisplay: React.FC<StoryDisplayProps> = ({
  messages,
  isLoading,
  error,
  currentPrompt,
  containerRef
}) => {
  // Get the combined story content from all messages
  const storyContent = messages.map(msg => msg.content || '').join('');
  
  // Debug logging to help troubleshoot
  useEffect(() => {
    console.log('StoryDisplay render', { 
      messagesCount: messages.length,
      hasContent: !!storyContent, 
      contentLength: storyContent?.length,
      isLoading
    });
  }, [messages, storyContent, isLoading]);

  return (
    <div 
      ref={containerRef}
      className="flex-1 bg-white rounded-lg border border-gray-200 p-4 overflow-y-auto"
      style={{ minHeight: '300px', maxHeight: '70vh' }}
    >
      {!storyContent && !isLoading && !error && (
        <div className="h-full flex flex-col items-center justify-center text-gray-500">
          <div className="text-center">
            <p className="mb-2">Select a category to generate a story</p>
            <p className="text-sm">The AI will create a unique story based on your selection</p>
          </div>
        </div>
      )}

      {isLoading && !storyContent && (
        <div className="flex flex-col space-y-3">
          <div className="animate-pulse flex space-x-4">
            <div className="flex-1 space-y-4 py-1">
              <div className="h-4 bg-gray-200 rounded w-3/4"></div>
              <div className="space-y-2">
                <div className="h-4 bg-gray-200 rounded"></div>
                <div className="h-4 bg-gray-200 rounded w-5/6"></div>
              </div>
            </div>
          </div>
          <div className="text-sm text-gray-500">
            Generating story based on: "{currentPrompt}"
          </div>
        </div>
      )}

      {error && (
        <div className="text-red-500 p-3 bg-red-50 rounded-md">
          <div className="font-medium">Error generating story</div>
          <div className="text-sm mt-1">{error}</div>
          <div className="mt-3 text-sm">
            Please try again or select a different category.
          </div>
        </div>
      )}

      {storyContent && (
        <div className="prose prose-sm md:prose lg:prose-lg max-w-none">
          {/* Render content as Markdown */}
          <ReactMarkdown>{storyContent}</ReactMarkdown>
          
          {/* Show typing indicator if still loading more content */}
          {isLoading && (
            <div className="inline-flex space-x-1 mt-2">
              <div className="w-2 h-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '0ms' }}></div>
              <div className="w-2 h-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '150ms' }}></div>
              <div className="w-2 h-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '300ms' }}></div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default StoryDisplay;
