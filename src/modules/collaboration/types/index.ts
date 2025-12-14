/**
 * Real-Time Collaboration System - Type Definitions
 * 
 * This module defines all TypeScript types and interfaces used throughout
 * the collaboration system, including WebSocket messages, database entities,
 * and service interfaces.
 */

// ============================================================================
// WebSocket Message Types
// ============================================================================

/**
 * Base message type - all WebSocket messages extend this
 */
export interface BaseMessage {
  type: string;
  timestamp?: number;
}

/**
 * Authentication message from client to server
 */
export interface AuthMessage extends BaseMessage {
  type: 'auth';
  token: string;
  sessionId: string;
}

/**
 * Authentication success response
 */
export interface AuthSuccessMessage extends BaseMessage {
  type: 'auth_success';
  userId: string;
  sessionId: string;
  role: UserRole;
  timestamp: number;
}

/**
 * Authentication error response
 */
export interface AuthErrorMessage extends BaseMessage {
  type: 'auth_error';
  error: string;
  code: number;
}

/**
 * Stream event from server to client
 */
export interface StreamEventMessage extends BaseMessage {
  type: 'stream_event';
  sessionId: string;
  event: DisplayStreamEvent;
  timestamp: number;
  eventId: string;
}

/**
 * Presence update from server to all clients
 */
export interface PresenceUpdateMessage extends BaseMessage {
  type: 'presence_update';
  sessionId: string;
  users: PresenceUser[];
  timestamp: number;
}

/**
 * Heartbeat message from client to server
 */
export interface HeartbeatMessage extends BaseMessage {
  type: 'heartbeat';
  sessionId: string;
  cursor?: CursorPosition;
}

/**
 * Create comment message from client to server (Phase 4)
 */
export interface CommentCreateMessage extends BaseMessage {
  type: 'comment.create';
  sessionId: string;
  eventId?: string;
  targetType: CommentTargetType;
  targetId: string;
  content: string;
  parentId?: string;
  metadata?: CommentMetadata;
}

/**
 * Comment created notification from server to all clients (Phase 4)
 */
export interface CommentCreatedMessage extends BaseMessage {
  type: 'comment.created';
  comment: CommentWithAuthor;
  sessionId: string;
  timestamp: number;
}

/**
 * Edit comment message from client to server (Phase 4)
 */
export interface CommentEditMessage extends BaseMessage {
  type: 'comment.edit';
  commentId: string;
  content: string;
  sessionId: string;
}

/**
 * Comment edited notification from server to all clients (Phase 4)
 */
export interface CommentEditedMessage extends BaseMessage {
  type: 'comment.edited';
  comment: CommentWithAuthor;
  previousVersion: CommentVersion;
  sessionId: string;
  timestamp: number;
}

/**
 * Delete comment message from client to server (Phase 4)
 */
export interface CommentDeleteMessage extends BaseMessage {
  type: 'comment.delete';
  commentId: string;
  sessionId: string;
}

/**
 * Comment deleted notification from server to all clients (Phase 4)
 */
export interface CommentDeletedMessage extends BaseMessage {
  type: 'comment.deleted';
  commentId: string;
  sessionId: string;
  timestamp: number;
}

/**
 * React to comment message from client to server (Phase 4)
 */
export interface CommentReactMessage extends BaseMessage {
  type: 'comment.react';
  commentId: string;
  reactionType: ReactionType;
  sessionId: string;
}

/**
 * Comment reaction notification from server to all clients (Phase 4)
 */
export interface CommentReactionMessage extends BaseMessage {
  type: 'comment.reaction';
  commentId: string;
  reaction: CommentReaction | null;
  sessionId: string;
  timestamp: number;
}

/**
 * Query comments message from client to server (Phase 4)
 */
export interface CommentQueryMessage extends BaseMessage {
  type: 'comment.query';
  sessionId: string;
  eventId?: string;
  targetType?: CommentTargetType;
  targetId?: string;
  includeDeleted?: boolean;
}

/**
 * Comments result message from server to client (Phase 4)
 */
export interface CommentsResultMessage extends BaseMessage {
  type: 'comments.result';
  comments: CommentWithAuthor[];
  sessionId: string;
  timestamp: number;
}

/**
 * Notification message from server to client (Phase 4)
 */
export interface NotificationMessage extends BaseMessage {
  type: 'notification';
  notification: Notification;
  timestamp: number;
}

/**
 * Mark notification as read message from client to server (Phase 4)
 */
export interface NotificationReadMessage extends BaseMessage {
  type: 'notification.read';
  notificationId: string;
}

/**
 * Activity event from server to all clients
 */
export interface ActivityMessage extends BaseMessage {
  type: 'activity';
  sessionId: string;
  activityType: ActivityType;
  actor: ActivityActor;
  details: Record<string, any>;
  timestamp: number;
}

/**
 * Join session message from client to server
 */
export interface SessionJoinMessage extends BaseMessage {
  type: 'session_join';
  sessionId: string;
}

/**
 * Leave session message from client to server
 */
export interface SessionLeaveMessage extends BaseMessage {
  type: 'session_leave';
  sessionId: string;
}

/**
 * Session state update from server to client
 */
export interface SessionStateMessage extends BaseMessage {
  type: 'session_state';
  sessionId: string;
  status: SessionStatus;
  startTime: number;
  endTime?: number;
  metadata: SessionMetadata;
}

/**
 * Error message from server to client
 */
export interface ErrorMessage extends BaseMessage {
  type: 'error';
  code: number;
  message: string;
  details?: Record<string, any>;
}

/**
 * Operation subscribe message from client to server
 */
export interface OperationSubscribeMessage extends BaseMessage {
  type: 'operation.subscribe';
  operationId: string;
  sessionId: string;
}

/**
 * Operation unsubscribe message from client to server
 */
export interface OperationUnsubscribeMessage extends BaseMessage {
  type: 'operation.unsubscribe';
  operationId: string;
  sessionId: string;
}

/**
 * Operation stream event from server to client
 */
export interface OperationStreamMessage extends BaseMessage {
  type: 'operation.stream';
  operationId: string;
  sessionId: string;
  event: OperationEvent;
  timestamp: number;
  eventId: string;
  userId?: string;
}

/**
 * Event acknowledgment from client to server
 */
export interface EventAckMessage extends BaseMessage {
  type: 'event.ack';
  eventId: string;
}

/**
 * Union type of all WebSocket messages
 */
export type WebSocketMessage =
  | AuthMessage
  | AuthSuccessMessage
  | AuthErrorMessage
  | StreamEventMessage
  | PresenceUpdateMessage
  | HeartbeatMessage
  | CommentCreateMessage
  | CommentCreatedMessage
  | CommentEditMessage
  | CommentEditedMessage
  | CommentDeleteMessage
  | CommentDeletedMessage
  | CommentReactMessage
  | CommentReactionMessage
  | CommentQueryMessage
  | CommentsResultMessage
  | NotificationMessage
  | NotificationReadMessage
  | ActivityMessage
  | SessionJoinMessage
  | SessionLeaveMessage
  | SessionStateMessage
  | OperationSubscribeMessage
  | OperationUnsubscribeMessage
  | OperationStreamMessage
  | EventAckMessage
  | CursorUpdateMessage
  | SessionCreateMessage
  | SessionCreatedMessage
  | ErrorMessage;

// ============================================================================
// Supporting Types
// ============================================================================

export type UserRole = 'viewer' | 'commenter' | 'operator';
export type UserStatus = 'online' | 'away' | 'offline';
export type CommentTargetType = 'event' | 'finding' | 'line' | 'tool_execution';
export type SessionStatus = 'active' | 'completed' | 'failed';
export type ActivityType =
  | 'user_joined'
  | 'user_left'
  | 'comment_added'
  | 'comment_edited'
  | 'comment_deleted'
  | 'comment_reacted'
  | 'action_taken';
export type ReactionType = 'like' | 'flag' | 'resolve' | 'question';
export type NotificationType = 'mention' | 'reply' | 'reaction';

export interface CursorPosition {
  eventId: string;
  position: number;
}

export interface PresenceUser {
  userId: string;
  username: string;
  role: UserRole;
  status: UserStatus;
  lastSeen: number;
  cursor?: CursorPosition;
}

export interface CommentAuthor {
  userId: string;
  username: string;
  fullName?: string;
  role?: UserRole;
}

export interface CommentMetadata {
  severity?: 'info' | 'warning' | 'critical';
  tags?: string[];
  resolved?: boolean;
  resolvedBy?: string;
  resolvedAt?: number;
  [key: string]: any;
}

/**
 * Comment with full author details (Phase 4)
 */
export interface CommentWithAuthor extends Comment {
  author: CommentAuthor;
  reactions: CommentReaction[];
  replyCount?: number;
  mentions?: string[];
}

/**
 * Comment reaction (Phase 4)
 */
export interface CommentReaction {
  id: string;
  commentId: string;
  userId: string;
  username: string;
  reactionType: ReactionType;
  createdAt: Date;
}

/**
 * Comment version for history (Phase 4)
 */
export interface CommentVersion {
  id: string;
  commentId: string;
  version: number;
  content: string;
  editedAt: Date;
  editedBy: string;
}

/**
 * Notification for mentions and replies (Phase 4)
 */
export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  commentId: string;
  sessionId: string;
  fromUserId: string;
  fromUsername: string;
  message: string;
  isRead: boolean;
  createdAt: Date;
}

export interface ActivityActor {
  userId: string;
  username: string;
}

export interface SessionMetadata {
  target: string;
  objective: string;
  currentStep?: number;
  totalSteps?: number;
  [key: string]: any;
}

/**
 * Display stream event type (referenced from existing StreamDisplay component)
 */
export interface DisplayStreamEvent {
  id: string;
  type: string;
  content: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

/**
 * Operation event from Python backend
 */
export interface OperationEvent {
  id: string;
  type: 'stdout' | 'stderr' | 'tool_start' | 'tool_end' | 'reasoning' | 'step_header' | 'error' | 'metrics' | 'completion';
  content: string;
  timestamp: number;
  operationId: string;
  sessionId?: string;
  userId?: string;
  metadata?: Record<string, any>;
}

/**
 * Cursor update message from client to server
 */
export interface CursorUpdateMessage extends BaseMessage {
  type: 'cursor_update';
  sessionId: string;
  userId: string;
  cursor: CursorPosition;
}

/**
 * Session create message from client to server
 */
export interface SessionCreateMessage extends BaseMessage {
  type: 'session_create';
  operationId: string;
  metadata: SessionMetadata;
}

/**
 * Session created message from server to client
 */
export interface SessionCreatedMessage extends BaseMessage {
  type: 'session_created';
  session: {
    sessionId: string;
    operationId: string;
    ownerId: string;
    metadata: SessionMetadata;
    startTime: number;
  };
  timestamp: number;
}

// ============================================================================
// Database Entity Types
// ============================================================================

/**
 * User entity from database
 */
export interface User {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  fullName?: string;
  role: 'admin' | 'operator' | 'analyst' | 'viewer';
  status: 'active' | 'inactive' | 'suspended';
  lastLogin?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Collaboration session entity from database
 */
export interface CollaborationSession {
  id: string;
  operationId: string;
  sessionId: string;
  ownerId: string;
  status: SessionStatus;
  target?: string;
  objective?: string;
  startTime: Date;
  endTime?: Date;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Session participant entity from database
 */
export interface SessionParticipant {
  id: string;
  sessionId: string;
  userId: string;
  role: UserRole;
  joinedAt: Date;
  leftAt?: Date;
}

/**
 * Comment entity from database
 */
export interface Comment {
  id: string;
  sessionId: string;
  authorId: string;
  targetType: CommentTargetType;
  targetId: string;
  content: string;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

/**
 * Activity log entity from database
 */
export interface ActivityLog {
  id: string;
  sessionId: string;
  userId?: string;
  activityType: string;
  details: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

// ============================================================================
// Service Interfaces
// ============================================================================

/**
 * Authentication service interface
 */
export interface IAuthService {
  /**
   * Generate a JWT token for a user
   */
  generateToken(userId: string, role: UserRole): Promise<string>;

  /**
   * Validate a JWT token and return decoded payload
   */
  validateToken(token: string): Promise<TokenPayload | null>;

  /**
   * Authenticate user with username and password
   */
  authenticateUser(username: string, password: string): Promise<User | null>;

  /**
   * Check if user has permission for a specific action
   */
  hasPermission(userId: string, action: string, resourceId?: string): Promise<boolean>;

  /**
   * Refresh an existing token
   */
  refreshToken(oldToken: string): Promise<string>;
}

/**
 * Token payload interface
 */
export interface TokenPayload {
  userId: string;
  username: string;
  role: UserRole;
  iat: number;
  exp: number;
}

/**
 * Session manager service interface
 */
export interface ISessionManager {
  /**
   * Create a new collaboration session
   */
  createSession(ownerId: string, operationId: string, metadata: SessionMetadata): Promise<CollaborationSession>;

  /**
   * Get session by ID
   */
  getSession(sessionId: string): Promise<CollaborationSession | null>;

  /**
   * Add participant to session
   */
  addParticipant(sessionId: string, userId: string, role: UserRole): Promise<SessionParticipant>;

  /**
   * Remove participant from session
   */
  removeParticipant(sessionId: string, userId: string): Promise<void>;

  /**
   * Get all participants in a session
   */
  getParticipants(sessionId: string): Promise<SessionParticipant[]>;

  /**
   * Update session status
   */
  updateSessionStatus(sessionId: string, status: SessionStatus): Promise<void>;

  /**
   * End a session
   */
  endSession(sessionId: string): Promise<void>;
}

/**
 * Presence manager service interface
 */
export interface IPresenceManager {
  /**
   * Set user presence in a session
   */
  setPresence(sessionId: string, userId: string, status: UserStatus, cursor?: CursorPosition): Promise<void>;

  /**
   * Get all online users in a session
   */
  getOnlineUsers(sessionId: string): Promise<PresenceUser[]>;

  /**
   * Remove user presence (on disconnect)
   */
  removePresence(sessionId: string, userId: string): Promise<void>;

  /**
   * Update user cursor position
   */
  updateCursor(sessionId: string, userId: string, cursor: CursorPosition): Promise<void>;
}

/**
 * Comment service interface
 */
export interface ICommentService {
  /**
   * Add a new comment
   */
  addComment(
    sessionId: string,
    authorId: string,
    targetType: CommentTargetType,
    targetId: string,
    content: string,
    metadata?: CommentMetadata
  ): Promise<Comment>;

  /**
   * Edit an existing comment
   */
  editComment(commentId: string, content: string): Promise<Comment>;

  /**
   * Delete a comment (soft delete)
   */
  deleteComment(commentId: string): Promise<void>;

  /**
   * Get comments for a target
   */
  getComments(sessionId: string, targetType?: CommentTargetType, targetId?: string): Promise<Comment[]>;

  /**
   * Get comment by ID
   */
  getComment(commentId: string): Promise<Comment | null>;
}

/**
 * Activity logger service interface
 */
export interface IActivityLogger {
  /**
   * Log an activity event
   */
  logActivity(
    sessionId: string,
    userId: string | null,
    activityType: ActivityType,
    details: Record<string, any>,
    ipAddress?: string,
    userAgent?: string
  ): Promise<ActivityLog>;

  /**
   * Get activity log for a session
   */
  getSessionActivity(sessionId: string, limit?: number): Promise<ActivityLog[]>;

  /**
   * Get activity log for a user
   */
  getUserActivity(userId: string, limit?: number): Promise<ActivityLog[]>;
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * WebSocket server configuration
 */
export interface WebSocketServerConfig {
  port: number;
  host: string;
  path: string;
  pingInterval: number;
  pingTimeout: number;
  maxConnections: number;
}

/**
 * Database configuration
 */
export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
  maxConnections: number;
  idleTimeout: number;
}

/**
 * Redis configuration
 */
export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db: number;
  keyPrefix: string;
  ttl: number;
}

/**
 * JWT configuration
 */
export interface JWTConfig {
  secret: string;
  expiresIn: string;
  refreshExpiresIn: string;
  issuer: string;
  audience: string;
}

/**
 * Event streaming configuration
 */
export interface EventStreamingConfig {
  enabled: boolean;
  maxEventsPerOperation: number;
  eventRetentionHours: number;
  rateLimitPerSecond: number;
  deduplicationWindowMs: number;
  bufferSize: number;
}

/**
 * HTTP API configuration for Python bridge
 */
export interface HttpApiConfig {
  enabled: boolean;
  port: number;
  apiKeyHeader: string;
  apiKeys: string[];
  rateLimitPerMinute: number;
  maxRequestSize: string;
}

/**
 * Complete collaboration system configuration
 */
export interface CollaborationConfig {
  server: WebSocketServerConfig;
  database: DatabaseConfig;
  redis: RedisConfig;
  jwt: JWTConfig;
  eventStreaming: EventStreamingConfig;
  httpApi: HttpApiConfig;
  enableLogging: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

// ============================================================================
// Connection Management Types
// ============================================================================

/**
 * WebSocket connection metadata
 */
export interface ConnectionMetadata {
  connectionId: string;
  userId: string;
  sessionId: string;
  role: UserRole;
  connectedAt: number;
  lastHeartbeat: number;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Connection state
 */
export type ConnectionState = 'connecting' | 'connected' | 'authenticated' | 'disconnected' | 'error';

// ============================================================================
// Error Types
// ============================================================================

/**
 * Collaboration system error codes
 */
export enum CollaborationErrorCode {
  AUTHENTICATION_FAILED = 1001,
  INVALID_TOKEN = 1002,
  SESSION_NOT_FOUND = 1003,
  PERMISSION_DENIED = 1004,
  INVALID_MESSAGE = 1005,
  RATE_LIMIT_EXCEEDED = 1006,
  SESSION_FULL = 1007,
  DATABASE_ERROR = 2001,
  REDIS_ERROR = 2002,
  INTERNAL_ERROR = 5000,
}

/**
 * Collaboration error class
 */
export class CollaborationError extends Error {
  constructor(
    public code: CollaborationErrorCode,
    message: string,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'CollaborationError';
  }
}