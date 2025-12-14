/**
 * UserAvatar Component
 * 
 * User avatar component with status indicator for collaboration sessions.
 * Shows user avatar/initials with online/away/offline visual states.
 * 
 * Features:
 * - User avatar with initials fallback
 * - Status indicator badge (online/away/offline)
 * - Tooltip with user details
 * - Color coding for different users
 * - Multiple size variants
 * - Click handling
 */

import React, { useMemo } from 'react';
import { PresenceUser, UserRole } from '../../../../../collaboration/types/index.js';

export interface UserAvatarProps {
  /** User presence data */
  user: PresenceUser;
  
  /** Size of the avatar in Tailwind units (e.g., 8 = w-8 h-8) */
  size?: number;
  
  /** Show tooltip on hover */
  showTooltip?: boolean;
  
  /** Click handler */
  onClick?: () => void;
  
  /** Custom class name */
  className?: string;
  
  /** Show status badge */
  showStatus?: boolean;
}

/**
 * Generate a consistent color for a user based on their userId
 */
function getUserColor(userId: string): string {
  const colors = [
    'bg-blue-500',
    'bg-green-500',
    'bg-purple-500',
    'bg-pink-500',
    'bg-indigo-500',
    'bg-yellow-500',
    'bg-red-500',
    'bg-teal-500',
  ];
  
  // Simple hash function to get consistent color for user
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  return colors[Math.abs(hash) % colors.length];
}

/**
 * Get user initials from username
 */
function getUserInitials(username: string): string {
  const parts = username.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return username.substring(0, 2).toUpperCase();
}

/**
 * Get role display color
 */
function getRoleColor(role: UserRole): string {
  switch (role) {
    case 'operator':
      return 'text-purple-600 dark:text-purple-400';
    case 'commenter':
      return 'text-blue-600 dark:text-blue-400';
    case 'viewer':
      return 'text-gray-600 dark:text-gray-400';
    default:
      return 'text-gray-600 dark:text-gray-400';
  }
}

/**
 * UserAvatar Component
 */
export const UserAvatar: React.FC<UserAvatarProps> = ({
  user,
  size = 10,
  showTooltip = true,
  onClick,
  className = '',
  showStatus = true,
}) => {
  const bgColor = useMemo(() => getUserColor(user.userId), [user.userId]);
  const initials = useMemo(() => getUserInitials(user.username), [user.username]);
  
  // Status badge color
  const statusColor = {
    online: 'bg-green-500',
    away: 'bg-yellow-500',
    offline: 'bg-gray-400'
  }[user.status];

  // Tooltip content
  const tooltipContent = showTooltip ? (
    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-sm rounded-lg shadow-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
      <div className="font-medium">{user.username}</div>
      <div className={`text-xs ${getRoleColor(user.role)} uppercase`}>
        {user.role}
      </div>
      <div className="text-xs text-gray-300 capitalize">
        {user.status}
      </div>
      {user.cursor && (
        <div className="text-xs text-gray-400 mt-1">
          Viewing: {user.cursor.eventId.substring(0, 8)}...
        </div>
      )}
      {/* Tooltip arrow */}
      <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
    </div>
  ) : null;

  return (
    <div 
      className={`
        relative group inline-block
        ${onClick ? 'cursor-pointer' : ''}
        ${className}
      `}
      onClick={onClick}
    >
      {/* Avatar */}
      <div 
        className={`
          flex items-center justify-center
          w-${size} h-${size}
          ${bgColor}
          rounded-full
          border-2 border-white dark:border-gray-800
          text-white font-semibold
          shadow-sm
          transition-transform
          ${onClick ? 'hover:scale-110' : ''}
        `}
        style={{ width: `${size * 0.25}rem`, height: `${size * 0.25}rem` }}
      >
        {initials}
      </div>

      {/* Status Badge */}
      {showStatus && (
        <div 
          className={`
            absolute bottom-0 right-0
            w-3 h-3
            ${statusColor}
            rounded-full
            border-2 border-white dark:border-gray-800
            ${user.status === 'online' ? 'animate-pulse' : ''}
          `}
          title={user.status}
        />
      )}

      {/* Tooltip */}
      {tooltipContent}
    </div>
  );
};

/**
 * User avatar with name label
 */
export const UserAvatarWithName: React.FC<UserAvatarProps & { 
  showRole?: boolean;
  layout?: 'horizontal' | 'vertical';
}> = ({ 
  user, 
  size = 10, 
  showRole = false,
  layout = 'horizontal',
  onClick,
  className = ''
}) => {
  const isHorizontal = layout === 'horizontal';
  
  return (
    <div 
      className={`
        flex items-center
        ${isHorizontal ? 'flex-row gap-3' : 'flex-col gap-2 text-center'}
        ${onClick ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 p-2 rounded-lg transition-colors' : ''}
        ${className}
      `}
      onClick={onClick}
    >
      <UserAvatar 
        user={user} 
        size={size} 
        showTooltip={false}
      />
      
      <div className={`${isHorizontal ? 'flex-1 min-w-0' : ''}`}>
        <div className="font-medium text-gray-900 dark:text-gray-100 truncate">
          {user.username}
        </div>
        {showRole && (
          <div className={`text-xs ${getRoleColor(user.role)} uppercase`}>
            {user.role}
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Avatar group component - displays multiple avatars in a stack
 */
export const AvatarGroup: React.FC<{
  users: PresenceUser[];
  size?: number;
  max?: number;
  onOverflowClick?: () => void;
  className?: string;
}> = ({ users, size = 8, max = 5, onOverflowClick, className = '' }) => {
  const visibleUsers = users.slice(0, max);
  const overflowCount = Math.max(0, users.length - max);

  return (
    <div className={`flex items-center -space-x-2 ${className}`}>
      {visibleUsers.map((user) => (
        <UserAvatar
          key={user.userId}
          user={user}
          size={size}
        />
      ))}
      
      {overflowCount > 0 && (
        <div
          className={`
            flex items-center justify-center
            w-${size} h-${size}
            bg-gray-200 dark:bg-gray-700
            rounded-full
            border-2 border-white dark:border-gray-800
            text-xs font-medium text-gray-600 dark:text-gray-300
            ${onOverflowClick ? 'cursor-pointer hover:bg-gray-300 dark:hover:bg-gray-600' : ''}
            transition-colors
          `}
          style={{ width: `${size * 0.25}rem`, height: `${size * 0.25}rem` }}
          onClick={onOverflowClick}
          title={`${overflowCount} more user${overflowCount > 1 ? 's' : ''}`}
        >
          +{overflowCount}
        </div>
      )}
    </div>
  );
};

export default UserAvatar;