/**
 * useCollaboration Hook
 *
 * React hook for WebSocket-based real-time collaboration.
 * Manages connection state, message handling, and automatic reconnection.
 *
 * Phase 2 Enhancements:
 * - Session management (create, join, leave)
 * - Enhanced presence tracking with status updates
 * - Activity feed subscription
 * - Cursor position broadcasting
 * - Away status detection (idle timeout)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  WebSocketMessage,
  ConnectionState,
  PresenceUser,
  Comment,
  CommentTargetType,
  CommentMetadata,
  SessionMetadata,
  ActivityLog,
  UserStatus,
  CursorPosition,
} from '../../../../collaboration/types/index.js';

/**
 * Collaboration hook configuration
 */
export interface UseCollaborationConfig {
  url: string;
  token: string;
  sessionId: string;
  autoConnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  debug?: boolean;
}

/**
 * Collaboration hook return value
 */
export interface UseCollaborationReturn {
  // Connection state
  connectionState: ConnectionState;
  isConnected: boolean;
  error: Error | null;

  // Connection control
  connect: () => void;
  disconnect: () => void;
  reconnect: () => void;

  // Presence (Phase 2 Enhanced)
  onlineUsers: PresenceUser[];
  userStatus: UserStatus;
  setUserStatus: (status: UserStatus) => void;
  cursorPosition: CursorPosition | null;
  updateCursor: (cursor: CursorPosition) => void;
  sendHeartbeat: (cursor?: CursorPosition) => void;

  // Comments
  comments: Comment[];
  addComment: (targetType: CommentTargetType, targetId: string, content: string, metadata?: CommentMetadata) => void;
  editComment: (commentId: string, content: string) => void;
  deleteComment: (commentId: string) => void;

  // Session (Phase 2 Enhanced)
  sessionMetadata: SessionMetadata | null;
  createSession: (operationId: string, metadata: SessionMetadata) => void;
  joinSession: (role?: string) => void;
  leaveSession: () => void;

  // Activity (Phase 2)
  activities: ActivityLog[];
  subscribeToActivities: boolean;
  setSubscribeToActivities: (subscribe: boolean) => void;

  // Raw message handling
  sendMessage: (message: WebSocketMessage) => void;
  lastMessage: WebSocketMessage | null;
}

/**
 * useCollaboration Hook
 */
export function useCollaboration(config: UseCollaborationConfig): UseCollaborationReturn {
  const {
    url,
    token,
    sessionId,
    autoConnect = true,
    reconnectInterval = 5000,
    maxReconnectAttempts = 10,
    debug = false,
  } = config;

  // State
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [error, setError] = useState<Error | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<PresenceUser[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [sessionMetadata, setSessionMetadata] = useState<SessionMetadata | null>(null);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  
  // Phase 2 State
  const [userStatus, setUserStatus] = useState<UserStatus>('online');
  const [cursorPosition, setCursorPosition] = useState<CursorPosition | null>(null);
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [subscribeToActivities, setSubscribeToActivities] = useState(false);

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const awayTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

  /**
   * Log debug messages
   */
  const log = useCallback(
    (...args: any[]) => {
      if (debug) {
        console.log('[useCollaboration]', ...args);
      }
    },
    [debug]
  );

  /**
   * Send message through WebSocket
   */
  const sendMessage = useCallback(
    (message: WebSocketMessage) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(message));
        log('Sent message:', message.type);
      } else {
        console.error('WebSocket not connected, cannot send message');
      }
    },
    [log]
  );

  /**
   * Handle incoming WebSocket messages
   */
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        setLastMessage(message);
        log('Received message:', message.type);

        switch (message.type) {
          case 'auth_success':
            setConnectionState('authenticated');
            log('Authenticated successfully');
            break;

          case 'auth_error':
            setError(new Error(message.error));
            setConnectionState('error');
            break;

          case 'presence_update':
            setOnlineUsers(message.users);
            log('Presence updated:', message.users.length, 'users');
            break;

          case 'cursor_update':
            // Handle cursor updates from other users
            log('Cursor update from user:', message.userId);
            break;

          case 'comment.created':
            setComments((prev) => [
              ...prev,
              {
                id: message.comment.id,
                sessionId: message.sessionId,
                authorId: message.comment.author.userId,
                targetType: message.comment.targetType,
                targetId: message.comment.targetId,
                content: message.comment.content,
                metadata: message.comment.metadata || {},
                createdAt: new Date(message.timestamp),
                updatedAt: new Date(message.timestamp),
              },
            ]);
            log('Comment added:', message.comment.id);
            break;

          case 'session_created':
            setSessionMetadata(message.session.metadata);
            log('Session created:', message.session.sessionId);
            break;

          case 'session_state':
            setSessionMetadata(message.metadata);
            log('Session state updated');
            break;

          case 'activity':
            if (subscribeToActivities) {
              setActivities((prev) => [message as any, ...prev].slice(0, 100)); // Keep last 100
              log('Activity received:', message.activityType);
            }
            break;

          case 'error':
            setError(new Error(message.message));
            log('Error received:', message.message);
            break;

          default:
            log('Unhandled message type:', message.type);
        }
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err);
      }
    },
    // Bug #99 Fix: Add subscribeToActivities to dependency array
    [log, subscribeToActivities]
  );

  /**
   * Connect to WebSocket server
   */
  const connect = useCallback(() => {
    if (wsRef.current) {
      log('Already connected or connecting');
      return;
    }

    try {
      log('Connecting to:', url);
      setConnectionState('connecting');
      setError(null);

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        log('WebSocket connected');
        setConnectionState('connected');
        reconnectAttemptsRef.current = 0;

        // Send authentication message
        sendMessage({
          type: 'auth',
          token,
          sessionId,
        });

        // Start heartbeat
        heartbeatIntervalRef.current = setInterval(() => {
          sendMessage({
            type: 'heartbeat',
            sessionId,
          });
        }, 30000); // Every 30 seconds
      };

      ws.onmessage = handleMessage;

      ws.onerror = (event) => {
        console.error('WebSocket error:', event);
        setError(new Error('WebSocket connection error'));
        setConnectionState('error');
      };

      ws.onclose = (event) => {
        log('WebSocket closed:', event.code, event.reason);
        setConnectionState('disconnected');
        wsRef.current = null;

        // Clear heartbeat
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
          heartbeatIntervalRef.current = null;
        }

        // Attempt reconnection if not a normal closure
        if (event.code !== 1000 && reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++;
          log(`Reconnecting in ${reconnectInterval}ms (attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, reconnectInterval);
        } else if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
          setError(new Error('Max reconnection attempts reached'));
        }
      };
    } catch (err) {
      console.error('Failed to create WebSocket:', err);
      setError(err as Error);
      setConnectionState('error');
    }
  }, [url, token, sessionId, handleMessage, reconnectInterval, maxReconnectAttempts, log]);

  /**
   * Disconnect from WebSocket server
   */
  const disconnect = useCallback(() => {
    log('Disconnecting');

    // Clear reconnect timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Clear heartbeat
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }

    // Close WebSocket
    if (wsRef.current) {
      wsRef.current.close(1000, 'Client disconnect');
      wsRef.current = null;
    }

    setConnectionState('disconnected');
    reconnectAttemptsRef.current = 0;
  }, [log]);

  /**
   * Manually trigger reconnection
   */
  const reconnect = useCallback(() => {
    log('Manual reconnect triggered');
    disconnect();
    setTimeout(() => {
      reconnectAttemptsRef.current = 0;
      connect();
    }, 100);
  }, [disconnect, connect, log]);

  /**
   * Send heartbeat with optional cursor position
   */
  const sendHeartbeat = useCallback(
    (cursor?: CursorPosition) => {
      sendMessage({
        type: 'heartbeat',
        sessionId,
        cursor: cursor || cursorPosition || undefined,
      });
      resetAwayTimer();
    },
    [sendMessage, sessionId, cursorPosition]
  );

  /**
   * Update cursor position (Phase 2)
   */
  const updateCursor = useCallback(
    (cursor: CursorPosition) => {
      setCursorPosition(cursor);
      sendMessage({
        type: 'cursor_update' as any,
        sessionId,
        cursor,
      });
      resetAwayTimer();
    },
    [sendMessage, sessionId]
  );

  /**
   * Update user status (Phase 2)
   */
  const updateUserStatus = useCallback(
    (status: UserStatus) => {
      setUserStatus(status);
      sendMessage({
        type: 'heartbeat',
        sessionId,
        cursor: cursorPosition || undefined,
      });
    },
    [sendMessage, sessionId, cursorPosition]
  );

  /**
   * Create a new session (Phase 2)
   */
  const createSession = useCallback(
    (operationId: string, metadata: SessionMetadata) => {
      sendMessage({
        type: 'session_create' as any,
        operationId,
        metadata,
      });
    },
    [sendMessage]
  );

  /**
   * Reset away timer (Phase 2)
   */
  const resetAwayTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    
    if (awayTimeoutRef.current) {
      clearTimeout(awayTimeoutRef.current);
    }

    // Set user back to online if they were away
    if (userStatus === 'away') {
      setUserStatus('online');
      // Send heartbeat without triggering resetAwayTimer again
      // Use direct WebSocket send instead of sendMessage to break cycle
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'heartbeat',
          sessionId,
          cursor: cursorPosition || undefined,
        }));
      }
    }

    // Set away after 2 minutes of inactivity
    awayTimeoutRef.current = setTimeout(() => {
      if (userStatus === 'online') {
        setUserStatus('away');
        // Don't send message here to avoid triggering resetAwayTimer
      }
    }, 120000); // 2 minutes
  }, [userStatus, sessionId, cursorPosition]);

  /**
   * Add a comment
   */
  const addComment = useCallback(
    (targetType: CommentTargetType, targetId: string, content: string, metadata?: CommentMetadata) => {
      sendMessage({
        type: 'comment.create',
        sessionId,
        targetType,
        targetId,
        content,
        metadata,
      });
    },
    [sendMessage, sessionId]
  );

  /**
   * Edit a comment
   */
  const editComment = useCallback(
    (commentId: string, content: string) => {
      sendMessage({
        type: 'comment.edit',
        commentId,
        content,
        sessionId,
      });
    },
    [sendMessage]
  );

  /**
   * Delete a comment
   */
  const deleteComment = useCallback(
    (commentId: string) => {
      sendMessage({
        type: 'comment.delete',
        commentId,
        sessionId,
      });
    },
    [sendMessage]
  );

  /**
   * Join session (explicit)
   */
  const joinSession = useCallback((role?: string) => {
    sendMessage({
      type: 'session_join',
      sessionId,
      role,
    } as any);
    resetAwayTimer();
  }, [sendMessage, sessionId, resetAwayTimer]);

  /**
   * Leave session (explicit)
   */
  const leaveSession = useCallback(() => {
    sendMessage({
      type: 'session_leave',
      sessionId,
    });
  }, [sendMessage, sessionId]);

  /**
   * Auto-connect on mount if enabled
   */
  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      disconnect();
      
      // Cleanup Phase 2 timers
      if (awayTimeoutRef.current) {
        clearTimeout(awayTimeoutRef.current);
      }
    };
  }, [autoConnect, connect, disconnect]); // Bug #100 Fix: Include connect and disconnect to prevent stale closure

  /**
   * Setup activity detection (Phase 2)
   */
  useEffect(() => {
    const handleActivity = () => {
      resetAwayTimer();
    };

    // Listen to user activity
    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('keypress', handleActivity);
    window.addEventListener('click', handleActivity);

    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keypress', handleActivity);
      window.removeEventListener('click', handleActivity);
    };
  }, [resetAwayTimer]);

  /**
   * Computed value for connection status
   */
  const isConnected = connectionState === 'connected' || connectionState === 'authenticated';

  return {
    // Connection state
    connectionState,
    isConnected,
    error,

    // Connection control
    connect,
    disconnect,
    reconnect,

    // Presence (Phase 2 Enhanced)
    onlineUsers,
    userStatus,
    setUserStatus: updateUserStatus,
    cursorPosition,
    updateCursor,
    sendHeartbeat,

    // Comments
    comments,
    addComment,
    editComment,
    deleteComment,

    // Session (Phase 2 Enhanced)
    sessionMetadata,
    createSession,
    joinSession,
    leaveSession,

    // Activity (Phase 2)
    activities,
    subscribeToActivities,
    setSubscribeToActivities,

    // Raw message handling
    sendMessage,
    lastMessage,
  };
}

export default useCollaboration;