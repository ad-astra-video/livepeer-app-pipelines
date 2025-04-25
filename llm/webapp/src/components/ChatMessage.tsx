import React from 'react';
import { Message } from '../types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ChatMessageProps {
  message: Message;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
  const formattedTime = new Date(message.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });

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
            {message.content}
          </ReactMarkdown>
        </div>
      </div>
      <div className="text-xs text-gray-500 mt-1">{formattedTime}</div>
    </div>
  );
};

export default ChatMessage;
