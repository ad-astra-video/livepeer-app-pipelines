import React, { useEffect, useState } from 'react';

export interface NotificationProps {
  message: string;
  type: 'success' | 'error' | 'info';
  id: string;
  onDismiss: (id: string) => void;
}

const Notification: React.FC<NotificationProps> = ({ message, type, id, onDismiss }) => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(() => onDismiss(id), 300); // Wait for fade out animation before removing
    }, 5000);

    return () => clearTimeout(timer);
  }, [id, onDismiss]);

  const bgColor = 
    type === 'success' ? 'bg-green-500' : 
    type === 'error' ? 'bg-red-500' : 
    'bg-blue-500';

  return (
    <div 
      className={`${bgColor} text-white p-3 rounded shadow-md mb-2 transition-opacity duration-300 ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div className="flex justify-between items-center">
        <p>{message}</p>
        <button 
          onClick={() => {
            setIsVisible(false);
            setTimeout(() => onDismiss(id), 300);
          }}
          className="ml-2 text-white hover:text-gray-200"
        >
          ✕
        </button>
      </div>
    </div>
  );
};

export default Notification;
