import React, { useState } from 'react';
import { Message } from '../types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface ChatMessageProps {
  message: Message;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
  const [isReasoningExpanded, setIsReasoningExpanded] = useState(false);
  
  const formattedTime = new Date(message.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });

  // Extract reasoning content if it exists
  const extractReasoningAndContent = (text: string) => {
    const thinkRegex = /<think>([\s\S]*?)<\/think>/;
    const match = text.match(thinkRegex);
    
    if (match) {
      const reasoning = match[1].trim();
      // Remove the think tags and their content from the main content
      const mainContent = text.replace(thinkRegex, '').trim();
      return { reasoning, mainContent, hasReasoning: reasoning.length > 0 };
    }
    
    return { reasoning: '', mainContent: text, hasReasoning: false };
  };

  const { reasoning, mainContent, hasReasoning } = extractReasoningAndContent(message.content);

  return (
    <div className={`mb-4 ${message.isUser ? 'text-right' : 'text-left'}`}>
      <div
        className={`inline-block max-w-[80%] rounded-lg px-4 py-2 ${
          message.isUser
            ? 'bg-blue-500 text-white rounded-br-none'
            : 'bg-gray-200 text-gray-800 rounded-bl-none'
        }`}
      >
        <div className="whitespace-pre-wrap break-words markdown-content">
          {/* Reasoning section at the top */}
          {hasReasoning && !message.isUser && (
            <div className="mb-2 border-b border-gray-300 pb-2">
              <button 
                onClick={() => setIsReasoningExpanded(!isReasoningExpanded)}
                className="flex items-center text-sm text-gray-600 hover:text-gray-900 transition-colors"
              >
                {isReasoningExpanded ? (
                  <ChevronDown size={16} className="mr-1" />
                ) : (
                  <ChevronRight size={16} className="mr-1" />
                )}
                Reasoning
              </button>
              
              {isReasoningExpanded && (
                <div className="mt-2 text-sm text-gray-700 bg-gray-100 p-2 rounded whitespace-pre-wrap">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {reasoning}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          )}
          
          {/* Main content after the reasoning section */}
          <ReactMarkdown 
            remarkPlugins={[remarkGfm]}
            components={{
              p: ({node, ...props}) => <p className="my-1" {...props} />,
              a: ({node, ...props}) => <a className="underline" {...props} />,
              ul: ({node, ...props}) => <ul className="list-disc" {...props} />,
              ol: ({node, ...props}) => <ol className="list-decimal" {...props} />,
              li: ({node, ...props}) => <li {...props} />,
              code: ({node, inline, ...props}) => 
                inline 
                  ? <code className="bg-opacity-20 bg-gray-700 px-1 rounded" {...props} />
                  : <code className="block bg-opacity-10 bg-gray-700 p-2 rounded my-2 overflow-x-auto" {...props} />
            }}
          >
            {mainContent}
          </ReactMarkdown>
        </div>
      </div>
      <div className="text-xs text-gray-500 mt-1">{formattedTime}</div>
    </div>
  );
};

export default ChatMessage;
