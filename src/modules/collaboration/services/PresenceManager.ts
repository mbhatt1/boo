/**
 * Presence Manager Service
 * 
 * Manages real-time user presence in collaboration sessions using Redis.
 * Tracks online/offline/away status, cursor positions, and activity states
 * with automatic heartbeat monitoring and timeout detection.
 * 
 * Features:
 * - Real-time presence tracking (online/away/offline)
 * - Redis-based storage for fast updates
 * - Heartbeat monitoring with automatic timeout
 * - Cursor position tracking
 * - Activity status updates
 * - Pub/sub notifications for presence changes
 */

import {
  IPresenceManager,
  PresenceUser,
  UserStatus,
  CursorPosition,
  CollaborationError,
  CollaborationErrorCode
} from '../types';
import { RedisClient } from '../redis/RedisClient';

/**
 * Presence data stored in Redis
 */
interface PresenceData {
  userId: string;
  username: string;
  role: string;
  status: UserStatus;
  lastSeen: number;
  cursor?: CursorPosition;
  activity?: string;
}

/**
 * Presence update event
 */
interface PresenceUpdateEvent {
  type: 'online' | 'offline' | 'away' | 'cursor' | 'activity';
  sessionId: string;
  userId: string;
  timestamp: number;
  data?: any;
}

/**
 * PresenceManager - Manages user presence in sessions
 */
export class PresenceManager implements IPresenceManager {
  private heartbeatTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private readonly HEARTBEAT_TIMEOUT = 30000; // 30 seconds
  private readonly PRESENCE_TTL = 60; // 60 seconds in Redis
  private readonly AWAY_THRESHOLD = 120000; // 2 minutes

  constructor(
    private redis: RedisClient,
    private getUserInfo?: (userId: string) => Promise<{ username: string; role: string }>
  ) {}

  /**
   * Set user presence in a session
   */
  async setPresence(
    sessionId: string,
    userId: string,
    status: UserStatus,
    cursor?: CursorPosition
  ): Promise<void> {
    try {
      if (!this.redis.isReady()) {
        throw new CollaborationError(
          CollaborationErrorCode.REDIS_ERROR,
          'Redis client is not ready'
        );
      }

      // Get user info if available
      let username = userId;
      let role = 'viewer';
      if (this.getUserInfo) {
        try {
          const userInfo = await this.getUserInfo(userId);
          username = userInfo.username;
          role = userInfo.role;
        } catch (error) {
          console.warn(`[PresenceManager] Could not fetch user info for ${userId}`);
        }
      }

      // Create presence data
      const presenceData: PresenceData = {
        userId,
        username,
        role,
        status,
        lastSeen: Date.now(),
        cursor
      };

      // Store in Redis with TTL
      const key = this.getPresenceKey(sessionId, userId);
      await this.redis.set(key, JSON.stringify(presenceData), this.PRESENCE_TTL);

      // Update session presence set
      await this.redis.zadd(
        this.getSessionPresenceKey(sessionId),
        Date.now(),
        userId
      );

      // Publish presence update
      await this.publishPresenceUpdate({
        type: 'online',
        sessionId,
        userId,
        timestamp: Date.now(),
        data: { status, cursor }
      });

      // Setup heartbeat monitoring
      this.setupHeartbeatTimeout(sessionId, userId);

      console.log(`[PresenceManager] Set presence for user ${userId} in session ${sessionId}: ${status}`);
    } catch (error) {
      if (error instanceof CollaborationError) {
        throw error;
      }
      throw new CollaborationError(
        CollaborationErrorCode.REDIS_ERROR,
        `Failed to set presence: ${(error as Error).message}`,
        { sessionId, userId, status }
      );
    }
  }

  /**
   * Get all online users in a session
   */
  async getOnlineUsers(sessionId: string): Promise<PresenceUser[]> {
    try {
      if (!this.redis.isReady()) {
        console.warn('[PresenceManager] Redis not ready, returning empty user list');
        return [];
      }

      // Get all user IDs in session
      const userIds = await this.redis.zrange(
        this.getSessionPresenceKey(sessionId),
        0,
        -1
      );

      // Fetch presence data for each user
      const users: PresenceUser[] = [];
      const now = Date.now();

      for (const userId of userIds) {
        const key = this.getPresenceKey(sessionId, userId);
        const dataStr = await this.redis.get(key);
        
        if (dataStr) {
          const data: PresenceData = JSON.parse(dataStr);
          
          // Determine status based on last seen time
          let status = data.status;
          const timeSinceLastSeen = now - data.lastSeen;
          
          if (timeSinceLastSeen > this.HEARTBEAT_TIMEOUT) {
            status = 'offline';
          } else if (timeSinceLastSeen > this.AWAY_THRESHOLD) {
            status = 'away';
          }

          users.push({
            userId: data.userId,
            username: data.username,
            role: data.role as any,
            status,
            lastSeen: data.lastSeen,
            cursor: data.cursor
          });
        }
      }

      return users;
    } catch (error) {
      console.error('[PresenceManager] Error getting online users:', error);
      return [];
    }
  }

  /**
   * Remove user presence (on disconnect)
   */
  async removePresence(sessionId: string, userId: string): Promise<void> {
    try {
      if (!this.redis.isReady()) {
        return;
      }

      // Clear heartbeat timeout
      this.clearHeartbeatTimeout(sessionId, userId);

      // Remove from Redis
      const key = this.getPresenceKey(sessionId, userId);
      await this.redis.del(key);

      // Remove from session presence set
      await this.redis.zrem(this.getSessionPresenceKey(sessionId), userId);

      // Publish offline event
      await this.publishPresenceUpdate({
        type: 'offline',
        sessionId,
        userId,
        timestamp: Date.now()
      });

      console.log(`[PresenceManager] Removed presence for user ${userId} in session ${sessionId}`);
    } catch (error) {
      console.error('[PresenceManager] Error removing presence:', error);
    }
  }

  /**
   * Update user cursor position
   */
  async updateCursor(
    sessionId: string,
    userId: string,
    cursor: CursorPosition
  ): Promise<void> {
    try {
      if (!this.redis.isReady()) {
        return;
      }

      // Get current presence data
      const key = this.getPresenceKey(sessionId, userId);
      const dataStr = await this.redis.get(key);
      
      if (!dataStr) {
        // User not in session, initialize presence
        await this.setPresence(sessionId, userId, 'online', cursor);
        return;
      }

      // Update cursor in presence data
      const data: PresenceData = JSON.parse(dataStr);
      data.cursor = cursor;
      data.lastSeen = Date.now();
      
      await this.redis.set(key, JSON.stringify(data), this.PRESENCE_TTL);

      // Publish cursor update
      await this.publishPresenceUpdate({
        type: 'cursor',
        sessionId,
        userId,
        timestamp: Date.now(),
        data: { cursor }
      });

      // Reset heartbeat timeout
      this.setupHeartbeatTimeout(sessionId, userId);
    } catch (error) {
      console.error('[PresenceManager] Error updating cursor:', error);
    }
  }

  /**
   * Update user activity status
   */
  async updateActivity(
    sessionId: string,
    userId: string,
    activity: string
  ): Promise<void> {
    try {
      if (!this.redis.isReady()) {
        return;
      }

      // Get current presence data
      const key = this.getPresenceKey(sessionId, userId);
      const dataStr = await this.redis.get(key);
      
      if (!dataStr) {
        return;
      }

      // Update activity in presence data
      const data: PresenceData = JSON.parse(dataStr);
      data.activity = activity;
      data.lastSeen = Date.now();
      
      await this.redis.set(key, JSON.stringify(data), this.PRESENCE_TTL);

      // Publish activity update
      await this.publishPresenceUpdate({
        type: 'activity',
        sessionId,
        userId,
        timestamp: Date.now(),
        data: { activity }
      });

      // Reset heartbeat timeout
      this.setupHeartbeatTimeout(sessionId, userId);
    } catch (error) {
      console.error('[PresenceManager] Error updating activity:', error);
    }
  }

  /**
   * Process heartbeat from user
   */
  async processHeartbeat(
    sessionId: string,
    userId: string,
    cursor?: CursorPosition
  ): Promise<void> {
    try {
      if (!this.redis.isReady()) {
        return;
      }

      // Get current presence data
      const key = this.getPresenceKey(sessionId, userId);
      const dataStr = await this.redis.get(key);
      
      if (!dataStr) {
        // Initialize presence if not exists
        await this.setPresence(sessionId, userId, 'online', cursor);
        return;
      }

      // Update last seen time
      const data: PresenceData = JSON.parse(dataStr);
      data.lastSeen = Date.now();
      data.status = 'online';
      if (cursor) {
        data.cursor = cursor;
      }
      
      await this.redis.set(key, JSON.stringify(data), this.PRESENCE_TTL);

      // Reset heartbeat timeout
      this.setupHeartbeatTimeout(sessionId, userId);
    } catch (error) {
      console.error('[PresenceManager] Error processing heartbeat:', error);
    }
  }

  /**
   * Get user count for a session
   */
  async getUserCount(sessionId: string): Promise<number> {
    try {
      if (!this.redis.isReady()) {
        return 0;
      }

      const users = await this.getOnlineUsers(sessionId);
      return users.filter(u => u.status === 'online').length;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Subscribe to presence updates for a session
   */
  async subscribeToPresence(
    sessionId: string,
    callback: (event: PresenceUpdateEvent) => void
  ): Promise<void> {
    try {
      const channel = this.getPresenceChannel(sessionId);
      await this.redis.subscribe(channel, (_, message) => {
        try {
          const event: PresenceUpdateEvent = JSON.parse(message);
          callback(event);
        } catch (error) {
          console.error('[PresenceManager] Error parsing presence event:', error);
        }
      });
    } catch (error) {
      console.error('[PresenceManager] Error subscribing to presence:', error);
    }
  }

  /**
   * Unsubscribe from presence updates
   */
  async unsubscribeFromPresence(sessionId: string): Promise<void> {
    try {
      const channel = this.getPresenceChannel(sessionId);
      await this.redis.unsubscribe(channel);
    } catch (error) {
      console.error('[PresenceManager] Error unsubscribing from presence:', error);
    }
  }

  /**
   * Setup heartbeat timeout monitoring
   */
  private setupHeartbeatTimeout(sessionId: string, userId: string): void {
    // Clear existing timeout
    this.clearHeartbeatTimeout(sessionId, userId);

    // Setup new timeout
    const timeoutKey = `${sessionId}:${userId}`;
    const timeout = setTimeout(async () => {
      console.log(`[PresenceManager] Heartbeat timeout for user ${userId} in session ${sessionId}`);
      await this.handleHeartbeatTimeout(sessionId, userId);
    }, this.HEARTBEAT_TIMEOUT);

    this.heartbeatTimeouts.set(timeoutKey, timeout);
  }

  /**
   * Clear heartbeat timeout
   */
  private clearHeartbeatTimeout(sessionId: string, userId: string): void {
    const timeoutKey = `${sessionId}:${userId}`;
    const timeout = this.heartbeatTimeouts.get(timeoutKey);
    if (timeout) {
      clearTimeout(timeout);
      this.heartbeatTimeouts.delete(timeoutKey);
    }
  }

  /**
   * Handle heartbeat timeout (mark user as offline)
   */
  private async handleHeartbeatTimeout(sessionId: string, userId: string): Promise<void> {
    try {
      // Mark user as offline
      await this.removePresence(sessionId, userId);
    } catch (error) {
      console.error('[PresenceManager] Error handling heartbeat timeout:', error);
    }
  }

  /**
   * Publish presence update event
   */
  private async publishPresenceUpdate(event: PresenceUpdateEvent): Promise<void> {
    try {
      const channel = this.getPresenceChannel(event.sessionId);
      await this.redis.publish(channel, JSON.stringify(event));
    } catch (error) {
      console.error('[PresenceManager] Error publishing presence update:', error);
    }
  }

  /**
   * Get Redis key for user presence
   */
  private getPresenceKey(sessionId: string, userId: string): string {
    return `presence:${sessionId}:${userId}`;
  }

  /**
   * Get Redis key for session presence set
   */
  private getSessionPresenceKey(sessionId: string): string {
    return `presence:session:${sessionId}`;
  }

  /**
   * Get Redis channel for presence updates
   */
  private getPresenceChannel(sessionId: string): string {
    return `presence:updates:${sessionId}`;
  }

  /**
   * Cleanup all resources
   */
  async shutdown(): Promise<void> {
    // Clear all heartbeat timeouts
    for (const timeout of this.heartbeatTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.heartbeatTimeouts.clear();
  }
}

/**
 * Create a PresenceManager instance
 */
export function createPresenceManager(
  redis: RedisClient,
  getUserInfo?: (userId: string) => Promise<{ username: string; role: string }>
): PresenceManager {
  return new PresenceManager(redis, getUserInfo);
}