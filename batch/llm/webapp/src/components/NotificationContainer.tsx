import React from 'react';
import Notification, { NotificationProps } from './Notification';

interface NotificationContainerProps {
  notifications: Omit<NotificationProps, 'onDismiss'>[];
  onDismiss: (id: string) => void;
}

const NotificationContainer: React.FC<NotificationContainerProps> = ({ 
  notifications, 
  onDismiss 
}) => {
  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 max-w-md w-full flex flex-col items-end">
      {notifications.map((notification) => (
        <Notification
          key={notification.id}
          id={notification.id}
          message={notification.message}
          type={notification.type}
          onDismiss={onDismiss}
        />
      ))}
    </div>
  );
};

export default NotificationContainer;
