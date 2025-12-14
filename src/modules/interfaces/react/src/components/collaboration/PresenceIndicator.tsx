/**
 * PresenceIndicator Component
 * 
 * Displays online user count and presence indicators for a collaboration session.
 * Shows individual user avatars/names with status badges and activity indicators.
 * 
 * Features:
 * - Online user count display
 * - Individual user avatars with status
 * - Status badges (online/away/offline)
 * - Cursor position indicators
 * - Activity indicators (viewing, commenting)
 */

import React from 'react';
import { PresenceUser } from '../../../../collaboration/types';
import { UserAvatar } from './UserAvatar';

export interface PresenceIndicatorProps {
  /** List of online users */
  users: PresenceUser[];
  
  /** Maximum number of avatars to show before collapsing */
  maxAvatars?: number;
  
  /** Show detailed user list on hover */
  showDetails?: boolean;
  
  /** Custom class name */
  className?: string;
  
  /** Size variant */
  size?: 'small' | 'medium' | 'large';
  
  /** Callback when user is clicked */
  onUserClick?: (user: PresenceUser) => void;
}

/**
 * PresenceIndicator Component
 */
export const PresenceIndicator: React.FC<PresenceIndicatorProps> = ({
  users,
  maxAvatars = 5,
  showDetails = true,
  className = '',
  size = 'medium',
  onUserClick,
}) => {
  const onlineUsers = users.filter(u => u.status === 'online');
  const awayUsers = users.filter(u => u.status === 'away');
  const totalUsers = users.length;

  const sizeClasses = {
    small: 'text-xs',
    medium: 'text-sm',
    large: 'text-base'
  };

  const avatarSizes = {
    small: 6,
    medium: 8,
    large: 10
  };

  // Determine which users to show
  const visibleUsers = users.slice(0, maxAvatars);
  const hiddenCount = Math.max(0, totalUsers - maxAvatars);

  return (
    <div className={`presence-indicator flex items-center gap-2 ${className}`}>
      {/* User Count Badge */}
      <div className={`presence-count flex items-center gap-1 ${sizeClasses[size]}`}>
        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
        <span className="font-medium text-gray-700 dark:text-gray-300">
          {onlineUsers.length} online
        </span>
        {awayUsers.length > 0 && (
          <span className="text-gray-500 dark:text-gray-400">
            ({awayUsers.length} away)
          </span>
        )}
      </div>

      {/* User Avatars */}
      {totalUsers > 0 && (
        <div className="presence-avatars flex items-center -space-x-2">
          {visibleUsers.map((user) => (
            <UserAvatar
              key={user.userId}
              user={user}
              size={avatarSizes[size]}
              showTooltip={showDetails}
              onClick={onUserClick ? () => onUserClick(user) : undefined}
            />
          ))}
          
          {/* Show +N indicator if there are hidden users */}
          {hiddenCount > 0 && (
            <div 
              className={`
                flex items-center justify-center
                w-${avatarSizes[size]} h-${avatarSizes[size]}
                bg-gray-200 dark:bg-gray-700
                rounded-full border-2 border-white dark:border-gray-800
                text-xs font-medium text-gray-600 dark:text-gray-300
                cursor-pointer hover:bg-gray-300 dark:hover:bg-gray-600
                transition-colors
              `}
              title={`${hiddenCount} more user${hiddenCount > 1 ? 's' : ''}`}
            >
              +{hiddenCount}
            </div>
          )}
        </div>
      )}

      {/* No users indicator */}
      {totalUsers === 0 && (
        <span className={`text-gray-500 dark:text-gray-400 italic ${sizeClasses[size]}`}>
          No users online
        </span>
      )}
    </div>
  );
};

/**
 * Compact presence indicator - just shows count
 */
export const PresenceIndicatorCompact: React.FC<{
  users: PresenceUser[];
  className?: string;
}> = ({ users, className = '' }) => {
  const onlineCount = users.filter(u => u.status === 'online').length;
  
  return (
    <div className={`inline-flex items-center gap-1.5 ${className}`}>
      <div className={`w-2 h-2 rounded-full ${onlineCount > 0 ? 'bg-green-500' : 'bg-gray-400'}`}></div>
      <span className="text-sm text-gray-600 dark:text-gray-300">
        {onlineCount}
      </span>
    </div>
  );
};

/**
 * Presence list - shows all users in a list format
 */
export const PresenceList: React.FC<{
  users: PresenceUser[];
  onUserClick?: (user: PresenceUser) => void;
  className?: string;
}> = ({ users, onUserClick, className = '' }) => {
  const sortedUsers = [...users].sort((a, b) => {
    // Sort by status first (online > away > offline)
    const statusOrder = { online: 0, away: 1, offline: 2 };
    const statusDiff = statusOrder[a.status] - statusOrder[b.status];
    if (statusDiff !== 0) return statusDiff;
    
    // Then by username
    return a.username.localeCompare(b.username);
  });

  if (users.length === 0) {
    return (
      <div className={`text-center py-8 text-gray-500 dark:text-gray-400 ${className}`}>
        No users in session
      </div>
    );
  }

  return (
    <div className={`presence-list space-y-2 ${className}`}>
      {sortedUsers.map((user) => (
        <div
          key={user.userId}
          onClick={onUserClick ? () => onUserClick(user) : undefined}
          className={`
            flex items-center gap-3 p-2 rounded-lg
            ${onUserClick ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700' : ''}
            transition-colors
          `}
        >
          <UserAvatar user={user} size={8} showTooltip={false} />
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-900 dark:text-gray-100 truncate">
                {user.username}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400 uppercase">
                {user.role}
              </span>
            </div>
            
            {user.cursor && (
              <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                Viewing: {user.cursor.eventId}
              </div>
            )}
          </div>
          
          {/* Status indicator */}
          <div className="flex items-center gap-1.5">
            <div className={`
              w-2 h-2 rounded-full
              ${user.status === 'online' ? 'bg-green-500' : ''}
              ${user.status === 'away' ? 'bg-yellow-500' : ''}
              ${user.status === 'offline' ? 'bg-gray-400' : ''}
            `}></div>
            <span className="text-xs text-gray-500 dark:text-gray-400 capitalize">
              {user.status}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
};

export default PresenceIndicator;