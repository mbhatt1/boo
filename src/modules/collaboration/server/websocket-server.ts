/**
 * WebSocket Server
 *
 * Core WebSocket server for real-time collaboration features.
 * Handles connections, authentication, message routing, and broadcasting.
 *
 * Phase 2 Integration:
 * - SessionManager for session operations
 * - PresenceManager for real-time presence tracking
 * - ActivityLogger for comprehensive activity logging
 */

import { WebSocketServer, WebSocket } from 'ws';
import { createServer, Server as HTTPServer } from 'http';
import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type {
  WebSocketMessage,
  ConnectionMetadata,
  ConnectionState,
  WebSocketServerConfig,
} from '../types/index.js';
import { CollaborationError, CollaborationErrorCode } from '../types/index.js';
import type { IAuthService } from '../types/index.js';
import type { SessionManager } from '../services/SessionManager';
import type { PresenceManager } from '../services/PresenceManager';
import type { ActivityLogger } from '../services/ActivityLogger';
import type { CommentService } from '../services/CommentService';
import type { NotificationService } from '../services/NotificationService';
import type { RateLimiter } from '../security/RateLimiter.js';

/**
 * Extended WebSocket with metadata
 */
interface ExtendedWebSocket extends WebSocket {
  metadata?: ConnectionMetadata;
  isAlive?: boolean;
  authTimeout?: NodeJS.Timeout;
}

/**
 * WebSocket Server Manager
 */
export class CollaborationWebSocketServer extends EventEmitter {
  private wss: WebSocketServer;
  private httpServer: HTTPServer;
  private config: WebSocketServerConfig;
  private authService: IAuthService;
  private sessionManager?: SessionManager;
  private presenceManager?: PresenceManager;
  private activityLogger?: ActivityLogger;
  private commentService?: CommentService;
  private notificationService?: NotificationService;
  private rateLimiter?: RateLimiter;
  private connections: Map<string, ExtendedWebSocket>;
  private sessionConnections: Map<string, Set<string>>; // sessionId -> Set<connectionId>
  private pingInterval: NodeJS.Timeout | null;

  constructor(
    config: WebSocketServerConfig,
    authService: IAuthService,
    sessionManager?: SessionManager,
    presenceManager?: PresenceManager,
    activityLogger?: ActivityLogger,
    commentService?: CommentService,
    notificationService?: NotificationService,
    rateLimiter?: RateLimiter
  ) {
    super();
    this.config = config;
    this.authService = authService;
    this.sessionManager = sessionManager;
    this.presenceManager = presenceManager;
    this.activityLogger = activityLogger;
    this.commentService = commentService;
    this.notificationService = notificationService;
    this.rateLimiter = rateLimiter;
    this.connections = new Map();
    this.sessionConnections = new Map();
    this.pingInterval = null;

    // Register notification callback for real-time delivery (Phase 4)
    if (this.notificationService) {
      this.notificationService.onNotification((userId, notification) => {
        this.sendToUser(userId, {
          type: 'notification',
          notification,
          timestamp: Date.now()
        });
      });
    }

    // Create HTTP server
    this.httpServer = createServer((req, res) => {
      // Health check endpoint
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'ok',
          connections: this.connections.size,
          uptime: process.uptime(),
        }));
        return;
      }

      // Default response
      res.writeHead(404);
      res.end('Not Found');
    });

    // Create WebSocket server
    this.wss = new WebSocketServer({
      server: this.httpServer,
      path: config.path,
      maxPayload: 1024 * 1024, // 1MB max message size
    });

    this.setupWebSocketServer();
  }

  /**
   * Setup WebSocket server event handlers
   */
  private setupWebSocketServer(): void {
    this.wss.on('connection', (ws: ExtendedWebSocket, req) => {
      const connectionId = this.generateConnectionId();
      
      console.log(`[WS] New connection: ${connectionId}`);

      // Initialize connection
      ws.isAlive = true;
      ws.on('pong', () => {
        ws.isAlive = true;
      });

      // Set authentication timeout (30 seconds)
      ws.authTimeout = setTimeout(() => {
        if (!ws.metadata) {
          console.log(`[WS] Authentication timeout for connection: ${connectionId}`);
          this.sendError(ws, CollaborationErrorCode.AUTHENTICATION_FAILED, 'Authentication timeout');
          ws.close(1008, 'Authentication timeout');
        }
      }, 30000);

      // Handle incoming messages
      ws.on('message', async (data: Buffer) => {
        try {
          await this.handleMessage(ws, connectionId, data);
        } catch (error) {
          console.error(`[WS] Error handling message:`, error);
          this.sendError(ws, CollaborationErrorCode.INTERNAL_ERROR, 'Internal server error');
        }
      });

      // Handle connection close
      ws.on('close', () => {
        // Bug #81 Fix: Clear auth timeout
        if (ws.authTimeout) {
          clearTimeout(ws.authTimeout);
          ws.authTimeout = undefined;
        }
        // Bug #86 Fix: Handle async disconnect properly
        this.handleDisconnect(connectionId).catch(err => {
          console.error('[WS] Error in handleDisconnect:', err);
        });
      });

      // Handle errors
      ws.on('error', (error) => {
        console.error(`[WS] Connection error:`, error);
        // Bug #86 Fix: Handle async disconnect properly
        this.handleDisconnect(connectionId).catch(err => {
          console.error('[WS] Error in handleDisconnect:', err);
        });
      });

      // Store connection (unauthenticated initially)
      this.connections.set(connectionId, ws);

      // Emit connection event
      this.emit('connection', connectionId);
    });

    this.wss.on('error', (error) => {
      console.error('[WS] Server error:', error);
      this.emit('error', error);
    });

    // Start ping/pong heartbeat
    this.startHeartbeat();
  }

  /**
   * Handle incoming WebSocket message
   */
  private async handleMessage(
    ws: ExtendedWebSocket,
    connectionId: string,
    data: Buffer
  ): Promise<void> {
    try {
      // Parse message
      const message: WebSocketMessage = JSON.parse(data.toString());
      
      console.log(`[WS] Received message: ${message.type} from ${connectionId}`);

      // Route message based on type
      switch (message.type) {
        case 'auth':
          await this.handleAuth(ws, connectionId, message);
          break;

        case 'heartbeat':
          await this.handleHeartbeat(ws, connectionId, message);
          break;

        // Session management (Phase 2)
        case 'session_create':
          await this.handleSessionCreate(ws, connectionId, message);
          break;

        case 'session_join':
          await this.handleSessionJoin(ws, connectionId, message);
          break;

        case 'session_leave':
          await this.handleSessionLeave(ws, connectionId, message);
          break;

        // Presence management (Phase 2)
        case 'presence_update':
          await this.handlePresenceUpdate(ws, connectionId, message);
          break;

        case 'cursor_update':
          await this.handleCursorUpdate(ws, connectionId, message);
          break;

        // Comments (Phase 4)
        case 'comment.create':
          await this.handleCommentCreate(ws, connectionId, message);
          break;

        case 'comment.edit':
          await this.handleCommentEdit(ws, connectionId, message);
          break;

        case 'comment.delete':
          await this.handleCommentDelete(ws, connectionId, message);
          break;

        case 'comment.react':
          await this.handleCommentReact(ws, connectionId, message);
          break;

        case 'comment.query':
          await this.handleCommentQuery(ws, connectionId, message);
          break;

        // Notifications (Phase 4)
        case 'notification.read':
          await this.handleNotificationRead(ws, connectionId, message);
          break;

        default:
          // Forward other messages to application layer
          this.emit('message', connectionId, message);
      }
    } catch (error) {
      console.error('[WS] Failed to parse message:', error);
      this.sendError(ws, CollaborationErrorCode.INVALID_MESSAGE, 'Invalid message format');
    }
  }

  /**
   * Handle authentication message
   */
  private async handleAuth(
    ws: ExtendedWebSocket,
    connectionId: string,
    message: any
  ): Promise<void> {
    try {
      const { token, sessionId } = message;

      if (!token || !sessionId) {
        this.sendError(ws, CollaborationErrorCode.INVALID_MESSAGE, 'Missing token or sessionId');
        return;
      }

      // Validate token
      const payload = await this.authService.validateToken(token);
      if (!payload) {
        this.sendError(ws, CollaborationErrorCode.AUTHENTICATION_FAILED, 'Invalid token');
        ws.close(1008, 'Authentication failed');
        return;
      }

      // Create connection metadata
      const metadata: ConnectionMetadata = {
        connectionId,
        userId: payload.userId,
        sessionId,
        role: payload.role,
        connectedAt: Date.now(),
        lastHeartbeat: Date.now(),
      };

      ws.metadata = metadata;

      // Clear authentication timeout
      if (ws.authTimeout) {
        clearTimeout(ws.authTimeout);
        ws.authTimeout = undefined;
      }

      // Send success response
      this.send(ws, {
        type: 'auth_success',
        userId: payload.userId,
        sessionId,
        role: payload.role,
        timestamp: Date.now(),
      });

      console.log(`[WS] Authenticated: ${payload.username} (${connectionId})`);
      this.emit('authenticated', connectionId, metadata);
    } catch (error) {
      console.error('[WS] Authentication error:', error);
      this.sendError(ws, CollaborationErrorCode.AUTHENTICATION_FAILED, 'Authentication failed');
      ws.close(1008, 'Authentication failed');
    }
  }

  /**
   * Handle heartbeat message
   */
  private async handleHeartbeat(
    ws: ExtendedWebSocket,
    connectionId: string,
    message: any
  ): Promise<void> {
    if (!ws.metadata) {
      this.sendError(ws, CollaborationErrorCode.AUTHENTICATION_FAILED, 'Not authenticated');
      return;
    }

    ws.metadata.lastHeartbeat = Date.now();
    ws.isAlive = true;

    // Update presence with heartbeat (Phase 2)
    if (this.presenceManager && message.sessionId) {
      await this.presenceManager.processHeartbeat(
        message.sessionId,
        ws.metadata.userId,
        message.cursor
      );
    }

    // Forward to application layer for presence updates
    this.emit('heartbeat', connectionId, message);
  }

  /**
   * Bug #82 Fix: Centralized connection cleanup method
   * Clears all timers and resources associated with a WebSocket connection
   */
  private cleanupConnection(ws: ExtendedWebSocket): void {
    // Clear authentication timeout
    if (ws.authTimeout) {
      clearTimeout(ws.authTimeout);
      ws.authTimeout = undefined;
    }
    
    // Additional cleanup can be added here as needed
    // (e.g., heartbeat intervals, other timers)
  }

  /**
   * Handle session create message (Phase 2)
   */
  private async handleSessionCreate(
    ws: ExtendedWebSocket,
    connectionId: string,
    message: any
  ): Promise<void> {
    if (!ws.metadata) {
      this.sendError(ws, CollaborationErrorCode.AUTHENTICATION_FAILED, 'Not authenticated');
      return;
    }

    if (!this.sessionManager) {
      this.sendError(ws, CollaborationErrorCode.INTERNAL_ERROR, 'Session manager not available');
      return;
    }

    try {
      const { operationId, metadata } = message;
      
      // Create session
      const session = await this.sessionManager.createSession(
        ws.metadata.userId,
        operationId,
        metadata || {}
      );

      // Send success response
      this.send(ws, {
        type: 'session_created',
        session,
        timestamp: Date.now()
      });

      // Log activity
      if (this.activityLogger) {
        await this.activityLogger.logActivity(
          session.id,
          ws.metadata.userId,
          'user_joined',
          { role: 'operator', action: 'create' }
        );
      }

      console.log(`[WS] Session created: ${session.sessionId}`);
    } catch (error) {
      console.error('[WS] Session create error:', error);
      this.sendError(ws, CollaborationErrorCode.INTERNAL_ERROR, 'Failed to create session');
    }
  }

  /**
   * Handle presence update message (Phase 2)
   */
  private async handlePresenceUpdate(
    ws: ExtendedWebSocket,
    connectionId: string,
    message: any
  ): Promise<void> {
    if (!ws.metadata) {
      this.sendError(ws, CollaborationErrorCode.AUTHENTICATION_FAILED, 'Not authenticated');
      return;
    }

    if (!this.presenceManager) {
      return;
    }

    try {
      const { sessionId, status, cursor } = message;
      
      await this.presenceManager.setPresence(
        sessionId,
        ws.metadata.userId,
        status,
        cursor
      );

      // Broadcast presence update to session
      const users = await this.presenceManager.getOnlineUsers(sessionId);
      this.broadcastToSession(sessionId, {
        type: 'presence_update',
        sessionId,
        users,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('[WS] Presence update error:', error);
    }
  }

  /**
   * Handle cursor update message (Phase 2)
   */
  private async handleCursorUpdate(
    ws: ExtendedWebSocket,
    connectionId: string,
    message: any
  ): Promise<void> {
    if (!ws.metadata) {
      return;
    }

    if (!this.presenceManager) {
      return;
    }

    try {
      const { sessionId, cursor } = message;
      
      await this.presenceManager.updateCursor(
        sessionId,
        ws.metadata.userId,
        cursor
      );

      // Broadcast cursor update to others in session
      this.broadcastToSession(sessionId, {
        type: 'cursor_update',
        sessionId,
        userId: ws.metadata.userId,
        cursor,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('[WS] Cursor update error:', error);
    }
  }

  /**
   * Handle session join message
   */
  private async handleSessionJoin(
    ws: ExtendedWebSocket,
    connectionId: string,
    message: any
  ): Promise<void> {
    if (!ws.metadata) {
      this.sendError(ws, CollaborationErrorCode.AUTHENTICATION_FAILED, 'Not authenticated');
      return;
    }

    // Bug #83 Fix: Add rate limiting on session join
    if (this.rateLimiter) {
      try {
        await this.rateLimiter.checkOperationLimit(
          ws.metadata.userId,
          'session.join',
          ws.metadata.role as 'viewer' | 'operator' | 'admin' | 'analyst'
        );
      } catch (error) {
        console.error('[WS] Rate limit exceeded for session join:', error);
        this.sendError(ws, CollaborationErrorCode.RATE_LIMIT_EXCEEDED, 'Rate limit exceeded for session join');
        return;
      }
    }

    const { sessionId, role } = message;
    if (!sessionId) {
      this.sendError(ws, CollaborationErrorCode.INVALID_MESSAGE, 'Missing sessionId');
      return;
    }

    // Add participant to session (Phase 2)
    if (this.sessionManager) {
      try {
        await this.sessionManager.addParticipant(
          sessionId,
          ws.metadata.userId,
          role || 'viewer'
        );
      } catch (error) {
        console.error('[WS] Failed to add participant:', error);
        this.sendError(ws, CollaborationErrorCode.PERMISSION_DENIED, 'Cannot join session');
        return;
      }
    }

    // Add to session connections (check existence to prevent null pointer dereference)
    if (!this.sessionConnections.has(sessionId)) {
      this.sessionConnections.set(sessionId, new Set());
    }
    const sessionConnectionSet = this.sessionConnections.get(sessionId);
    if (sessionConnectionSet) {
      sessionConnectionSet.add(connectionId);
    }

    // Set presence (Phase 2)
    if (this.presenceManager) {
      await this.presenceManager.setPresence(
        sessionId,
        ws.metadata.userId,
        'online'
      );
    }

    // Log activity (Phase 2)
    if (this.activityLogger) {
      await this.activityLogger.logUserJoined(
        sessionId,
        ws.metadata.userId,
        role || 'viewer'
      );
    }

    // Send presence update to all in session
    if (this.presenceManager) {
      const users = await this.presenceManager.getOnlineUsers(sessionId);
      this.broadcastToSession(sessionId, {
        type: 'presence_update',
        sessionId,
        users,
        timestamp: Date.now()
      });
    }

    console.log(`[WS] User ${ws.metadata.userId} joined session ${sessionId}`);
    this.emit('session_join', connectionId, sessionId);
  }

  /**
   * Handle session leave message
   */
  private async handleSessionLeave(
    ws: ExtendedWebSocket,
    connectionId: string,
    message: any
  ): Promise<void> {
    if (!ws.metadata) {
      return;
    }

    const { sessionId } = message;
    if (!sessionId) {
      return;
    }

    // Remove from session connections
    // Bug #84 Fix: Replace non-null assertion with safe access
    const connections = this.sessionConnections.get(sessionId);
    if (connections) {
      connections.delete(connectionId);
    }

    // Remove participant from session (Phase 2)
    if (this.sessionManager) {
      try {
        await this.sessionManager.removeParticipant(sessionId, ws.metadata.userId);
      } catch (error) {
        console.error('[WS] Failed to remove participant:', error);
      }
    }

    // Remove presence (Phase 2)
    if (this.presenceManager) {
      await this.presenceManager.removePresence(sessionId, ws.metadata.userId);
    }

    // Log activity (Phase 2)
    if (this.activityLogger) {
      await this.activityLogger.logUserLeft(sessionId, ws.metadata.userId);
    }

    // Broadcast updated presence to session
    if (this.presenceManager) {
      const users = await this.presenceManager.getOnlineUsers(sessionId);
      this.broadcastToSession(sessionId, {
        type: 'presence_update',
        sessionId,
        users,
        timestamp: Date.now()
      });
    }

    console.log(`[WS] User ${ws.metadata.userId} left session ${sessionId}`);
    this.emit('session_leave', connectionId, sessionId);
  }

  /**
   * Handle comment create message (Phase 4)
   */
  private async handleCommentCreate(
    ws: ExtendedWebSocket,
    connectionId: string,
    message: any
  ): Promise<void> {
    if (!ws.metadata) {
      this.sendError(ws, CollaborationErrorCode.AUTHENTICATION_FAILED, 'Not authenticated');
      return;
    }

    if (!this.commentService) {
      this.sendError(ws, CollaborationErrorCode.INTERNAL_ERROR, 'Comment service not available');
      return;
    }

    try {
      const { sessionId, targetType, targetId, content, eventId, parentId, metadata } = message;

      // Create comment
      const comment = await this.commentService.createComment(
        sessionId,
        ws.metadata.userId,
        targetType,
        targetId,
        content,
        eventId,
        parentId,
        metadata
      );

      // Broadcast to all session participants
      this.broadcastToSession(sessionId, {
        type: 'comment.created',
        comment,
        sessionId,
        timestamp: Date.now()
      });

      // Log activity
      if (this.activityLogger) {
        await this.activityLogger.logActivity(
          sessionId,
          ws.metadata.userId,
          'comment_added',
          { commentId: comment.id, targetType, targetId }
        );
      }

      console.log(`[WS] Comment created: ${comment.id} in session ${sessionId}`);
    } catch (error) {
      console.error('[WS] Comment create error:', error);
      const errorMessage = error instanceof CollaborationError ? error.message : 'Failed to create comment';
      const errorCode = error instanceof CollaborationError ? error.code : CollaborationErrorCode.INTERNAL_ERROR;
      this.sendError(ws, errorCode, errorMessage);
    }
  }

  /**
   * Handle comment edit message (Phase 4)
   */
  private async handleCommentEdit(
    ws: ExtendedWebSocket,
    connectionId: string,
    message: any
  ): Promise<void> {
    if (!ws.metadata) {
      this.sendError(ws, CollaborationErrorCode.AUTHENTICATION_FAILED, 'Not authenticated');
      return;
    }

    if (!this.commentService) {
      this.sendError(ws, CollaborationErrorCode.INTERNAL_ERROR, 'Comment service not available');
      return;
    }

    try {
      const { commentId, content, sessionId } = message;

      // Edit comment
      const comment = await this.commentService.editComment(commentId, content, ws.metadata.userId);

      // Get version history for the edited comment
      const versions = await this.commentService.getCommentVersions(commentId, ws.metadata.userId);
      
      // Bug #85 Fix: Properly handle optional previousVersion field
      // Broadcast to all session participants with optional previousVersion
      this.broadcastToSession(sessionId, {
        type: 'comment.edited',
        comment,
        previousVersion: versions.length > 0 ? versions[0] : undefined,
        sessionId,
        timestamp: Date.now()
      } as WebSocketMessage);

      // Log activity
      if (this.activityLogger) {
        await this.activityLogger.logActivity(
          sessionId,
          ws.metadata.userId,
          'comment_edited',
          { commentId }
        );
      }

      console.log(`[WS] Comment edited: ${commentId}`);
    } catch (error) {
      console.error('[WS] Comment edit error:', error);
      const errorMessage = error instanceof CollaborationError ? error.message : 'Failed to edit comment';
      const errorCode = error instanceof CollaborationError ? error.code : CollaborationErrorCode.INTERNAL_ERROR;
      this.sendError(ws, errorCode, errorMessage);
    }
  }

  /**
   * Handle comment delete message (Phase 4)
   */
  private async handleCommentDelete(
    ws: ExtendedWebSocket,
    connectionId: string,
    message: any
  ): Promise<void> {
    if (!ws.metadata) {
      this.sendError(ws, CollaborationErrorCode.AUTHENTICATION_FAILED, 'Not authenticated');
      return;
    }

    if (!this.commentService) {
      this.sendError(ws, CollaborationErrorCode.INTERNAL_ERROR, 'Comment service not available');
      return;
    }

    try {
      const { commentId, sessionId } = message;

      // Delete comment
      await this.commentService.deleteComment(commentId, ws.metadata.userId);

      // Broadcast to all session participants
      this.broadcastToSession(sessionId, {
        type: 'comment.deleted',
        commentId,
        sessionId,
        timestamp: Date.now()
      });

      // Log activity
      if (this.activityLogger) {
        await this.activityLogger.logActivity(
          sessionId,
          ws.metadata.userId,
          'comment_deleted',
          { commentId }
        );
      }

      console.log(`[WS] Comment deleted: ${commentId}`);
    } catch (error) {
      console.error('[WS] Comment delete error:', error);
      const errorMessage = error instanceof CollaborationError ? error.message : 'Failed to delete comment';
      const errorCode = error instanceof CollaborationError ? error.code : CollaborationErrorCode.INTERNAL_ERROR;
      this.sendError(ws, errorCode, errorMessage);
    }
  }

  /**
   * Handle comment react message (Phase 4)
   */
  private async handleCommentReact(
    ws: ExtendedWebSocket,
    connectionId: string,
    message: any
  ): Promise<void> {
    if (!ws.metadata) {
      this.sendError(ws, CollaborationErrorCode.AUTHENTICATION_FAILED, 'Not authenticated');
      return;
    }

    if (!this.commentService) {
      this.sendError(ws, CollaborationErrorCode.INTERNAL_ERROR, 'Comment service not available');
      return;
    }

    try {
      const { commentId, reactionType, sessionId } = message;

      // Toggle reaction
      const reaction = await this.commentService.reactToComment(
        commentId,
        ws.metadata.userId,
        reactionType
      );

      // Broadcast to all session participants
      this.broadcastToSession(sessionId, {
        type: 'comment.reaction',
        commentId,
        reaction,
        sessionId,
        timestamp: Date.now()
      });

      // Log activity
      if (this.activityLogger) {
        await this.activityLogger.logActivity(
          sessionId,
          ws.metadata.userId,
          'comment_reacted',
          { commentId, reactionType, action: reaction ? 'added' : 'removed' }
        );
      }

      console.log(`[WS] Comment reaction: ${commentId} - ${reactionType}`);
    } catch (error) {
      console.error('[WS] Comment react error:', error);
      const errorMessage = error instanceof CollaborationError ? error.message : 'Failed to react to comment';
      const errorCode = error instanceof CollaborationError ? error.code : CollaborationErrorCode.INTERNAL_ERROR;
      this.sendError(ws, errorCode, errorMessage);
    }
  }

  /**
   * Handle comment query message (Phase 4)
   */
  private async handleCommentQuery(
    ws: ExtendedWebSocket,
    connectionId: string,
    message: any
  ): Promise<void> {
    if (!ws.metadata) {
      this.sendError(ws, CollaborationErrorCode.AUTHENTICATION_FAILED, 'Not authenticated');
      return;
    }

    if (!this.commentService) {
      this.sendError(ws, CollaborationErrorCode.INTERNAL_ERROR, 'Comment service not available');
      return;
    }

    try {
      const { sessionId, eventId, targetType, targetId, includeDeleted } = message;

      // Query comments
      const comments = await this.commentService.getComments(
        sessionId,
        ws.metadata.userId,
        {
          eventId,
          targetType,
          targetId,
          includeDeleted
        }
      );

      // Send result to requester only
      this.send(ws, {
        type: 'comments.result',
        comments,
        sessionId,
        timestamp: Date.now()
      });

      console.log(`[WS] Comment query: ${comments.length} results for session ${sessionId}`);
    } catch (error) {
      console.error('[WS] Comment query error:', error);
      const errorMessage = error instanceof CollaborationError ? error.message : 'Failed to query comments';
      const errorCode = error instanceof CollaborationError ? error.code : CollaborationErrorCode.INTERNAL_ERROR;
      this.sendError(ws, errorCode, errorMessage);
    }
  }

  /**
   * Handle notification read message (Phase 4)
   */
  private async handleNotificationRead(
    ws: ExtendedWebSocket,
    connectionId: string,
    message: any
  ): Promise<void> {
    if (!ws.metadata) {
      this.sendError(ws, CollaborationErrorCode.AUTHENTICATION_FAILED, 'Not authenticated');
      return;
    }

    if (!this.notificationService) {
      return;
    }

    try {
      const { notificationId } = message;

      await this.notificationService.markAsRead(notificationId, ws.metadata.userId);

      console.log(`[WS] Notification marked as read: ${notificationId}`);
    } catch (error) {
      console.error('[WS] Notification read error:', error);
    }
  }

  /**
   * Handle client disconnect
   * Bug #86 Fix: Make async for proper error handling
   */
  private async handleDisconnect(connectionId: string): Promise<void> {
    const ws = this.connections.get(connectionId);
    if (!ws) return;

    console.log(`[WS] Connection closed: ${connectionId}`);

    // Remove from session connections and update presence (Phase 2)
    if (ws.metadata) {
      for (const [sessionId, connections] of this.sessionConnections.entries()) {
        if (connections.has(connectionId)) {
          connections.delete(connectionId);
          
          // Remove presence with proper error handling
          if (this.presenceManager) {
            try {
              await this.presenceManager.removePresence(sessionId, ws.metadata.userId);
            } catch (err) {
              console.error('[WS] Error removing presence on disconnect:', err);
            }
          }
          
          // Log activity with proper error handling
          if (this.activityLogger) {
            try {
              await this.activityLogger.logUserLeft(sessionId, ws.metadata.userId);
            } catch (err) {
              console.error('[WS] Error logging user left:', err);
            }
          }
          
          this.emit('session_leave', connectionId, sessionId);
        }
      }
    }

    // Remove connection
    this.connections.delete(connectionId);

    // Emit disconnect event
    this.emit('disconnect', connectionId, ws.metadata);
  }

  /**
   * Broadcast message to all connections in a session
   */
  broadcastToSession(sessionId: string, message: WebSocketMessage): void {
    const connections = this.sessionConnections.get(sessionId);
    if (!connections) return;

    let sentCount = 0;
    for (const connectionId of connections) {
      const ws = this.connections.get(connectionId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        this.send(ws, message);
        sentCount++;
      }
    }

    console.log(`[WS] Broadcast to session ${sessionId}: ${sentCount} recipients`);
  }

  /**
   * Send message to specific connection
   */
  sendToConnection(connectionId: string, message: WebSocketMessage): void {
    const ws = this.connections.get(connectionId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      this.send(ws, message);
    }
  }

  /**
   * Send message to specific user (all their connections)
   */
  sendToUser(userId: string, message: WebSocketMessage): void {
    let sentCount = 0;
    for (const [connectionId, ws] of this.connections.entries()) {
      if (ws.metadata?.userId === userId && ws.readyState === WebSocket.OPEN) {
        this.send(ws, message);
        sentCount++;
      }
    }
    console.log(`[WS] Sent to user ${userId}: ${sentCount} connections`);
  }

  /**
   * Send message through WebSocket
   */
  private send(ws: WebSocket, message: any): void {
    try {
      ws.send(JSON.stringify(message));
    } catch (error) {
      console.error('[WS] Failed to send message:', error);
    }
  }

  /**
   * Send error message
   */
  private sendError(ws: WebSocket, code: CollaborationErrorCode, message: string): void {
    this.send(ws, {
      type: 'error',
      code,
      message,
      timestamp: Date.now(),
    });
  }

  /**
   * Start heartbeat to detect dead connections
   */
  private startHeartbeat(): void {
    this.pingInterval = setInterval(() => {
      for (const [connectionId, ws] of this.connections.entries()) {
        if (ws.isAlive === false) {
          console.log(`[WS] Terminating dead connection: ${connectionId}`);
          ws.terminate();
          // Bug #86 Fix: Handle async disconnect properly
          this.handleDisconnect(connectionId).catch(err => {
            console.error('[WS] Error in handleDisconnect:', err);
          });
          continue;
        }

        ws.isAlive = false;
        ws.ping();
      }
    }, this.config.pingInterval);
  }

  /**
   * Get connection metadata
   */
  getConnectionMetadata(connectionId: string): ConnectionMetadata | undefined {
    return this.connections.get(connectionId)?.metadata;
  }

  /**
   * Get all connections for a session
   */
  getSessionConnections(sessionId: string): ConnectionMetadata[] {
    const connections = this.sessionConnections.get(sessionId);
    if (!connections) return [];

    const metadata: ConnectionMetadata[] = [];
    for (const connectionId of connections) {
      const ws = this.connections.get(connectionId);
      if (ws?.metadata) {
        metadata.push(ws.metadata);
      }
    }
    return metadata;
  }

  /**
   * Get server statistics
   */
  getStats() {
    return {
      totalConnections: this.connections.size,
      authenticatedConnections: Array.from(this.connections.values()).filter(ws => ws.metadata).length,
      activeSessions: this.sessionConnections.size,
      uptime: process.uptime(),
    };
  }

  /**
   * Generate unique connection ID
   */
  private generateConnectionId(): string {
    // Use cryptographically secure random UUID instead of Math.random()
    return `conn_${Date.now()}_${randomUUID()}`;
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.httpServer.listen(this.config.port, this.config.host, () => {
          console.log(`[WS] Server listening on ${this.config.host}:${this.config.port}${this.config.path}`);
          this.emit('start');
          resolve();
        });

        this.httpServer.on('error', (error) => {
          console.error('[WS] Server failed to start:', error);
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    console.log('[WS] Stopping server...');

    // Stop heartbeat
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    // Shutdown Phase 2 services
    if (this.presenceManager) {
      await this.presenceManager.shutdown();
    }
    if (this.activityLogger) {
      await this.activityLogger.shutdown();
    }

    // Close all connections
    for (const [connectionId, ws] of this.connections.entries()) {
      ws.close(1001, 'Server shutting down');
    }
    this.connections.clear();
    this.sessionConnections.clear();

    // Close WebSocket server
    return new Promise((resolve, reject) => {
      this.wss.close((error) => {
        if (error) {
          console.error('[WS] Error closing WebSocket server:', error);
          reject(error);
          return;
        }

        // Close HTTP server
        this.httpServer.close((error) => {
          if (error) {
            console.error('[WS] Error closing HTTP server:', error);
            reject(error);
            return;
          }

          console.log('[WS] Server stopped');
          this.emit('stop');
          resolve();
        });
      });
    });
  }
}

/**
 * Factory function to create WebSocket server
 */
export function createWebSocketServer(
  config: WebSocketServerConfig,
  authService: IAuthService,
  sessionManager?: SessionManager,
  presenceManager?: PresenceManager,
  activityLogger?: ActivityLogger
): CollaborationWebSocketServer {
  return new CollaborationWebSocketServer(
    config,
    authService,
    sessionManager,
    presenceManager,
    activityLogger
  );
}

export default CollaborationWebSocketServer;