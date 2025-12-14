/**
 * Notification Service - Phase 4
 * 
 * Service for managing user notifications for mentions, replies, and reactions.
 * Handles notification queries, real-time delivery, and marking notifications
 * as read.
 * 
 * Features:
 * - Get user notifications (all or unread only)
 * - Get unread notification count
 * - Mark notifications as read (single or batch)
 * - Real-time notification delivery via WebSocket
 * - Email digest configuration (future enhancement)
 */

import {
  Notification,
  NotificationMessage,
  CollaborationError,
  CollaborationErrorCode
} from '../types';
import { CommentRepository } from '../repositories/CommentRepository';

/**
 * Notification delivery callback for WebSocket integration
 */
export type NotificationCallback = (userId: string, notification: Notification) => void;

/**
 * Notification configuration
 */
export interface NotificationConfig {
  enableRealtime: boolean;
  enableEmailDigest: boolean;
  emailDigestIntervalHours: number;
  maxNotificationsPerQuery: number;
}

/**
 * NotificationService - Manages user notifications
 */
export class NotificationService {
  private notificationCallbacks: Set<NotificationCallback> = new Set();
  private config: NotificationConfig;

  constructor(
    private commentRepo: CommentRepository,
    config?: Partial<NotificationConfig>
  ) {
    this.config = {
      enableRealtime: true,
      enableEmailDigest: false,
      emailDigestIntervalHours: 24,
      maxNotificationsPerQuery: 100,
      ...config
    };
  }

  /**
   * Register a callback for real-time notification delivery
   */
  onNotification(callback: NotificationCallback): void {
    this.notificationCallbacks.add(callback);
  }

  /**
   * Unregister a notification callback
   */
  offNotification(callback: NotificationCallback): void {
    this.notificationCallbacks.delete(callback);
  }

  /**
   * Get notifications for a user
   */
  async getUserNotifications(
    userId: string,
    unreadOnly: boolean = false,
    limit?: number
  ): Promise<Notification[]> {
    try {
      const maxLimit = Math.min(
        limit || this.config.maxNotificationsPerQuery,
        this.config.maxNotificationsPerQuery
      );

      return await this.commentRepo.getUserNotifications(userId, unreadOnly, maxLimit);
    } catch (error) {
      if (error instanceof CollaborationError) {
        throw error;
      }
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        `Failed to get user notifications: ${(error as Error).message}`,
        { userId, unreadOnly }
      );
    }
  }

  /**
   * Get unread notification count for a user
   */
  async getUnreadCount(userId: string): Promise<number> {
    try {
      return await this.commentRepo.getUnreadNotificationCount(userId);
    } catch (error) {
      if (error instanceof CollaborationError) {
        throw error;
      }
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        `Failed to get unread notification count: ${(error as Error).message}`,
        { userId }
      );
    }
  }

  /**
   * Mark a notification as read
   */
  async markAsRead(notificationId: string, userId: string): Promise<void> {
    try {
      // Verify notification belongs to user before marking as read
      const notifications = await this.commentRepo.getUserNotifications(userId, false, 1000);
      const notification = notifications.find(n => n.id === notificationId);

      if (!notification) {
        throw new CollaborationError(
          CollaborationErrorCode.PERMISSION_DENIED,
          'Notification not found or does not belong to user',
          { notificationId, userId }
        );
      }

      await this.commentRepo.markNotificationRead(notificationId);

      console.log(`[NotificationService] Marked notification ${notificationId} as read for user ${userId}`);
    } catch (error) {
      if (error instanceof CollaborationError) {
        throw error;
      }
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        `Failed to mark notification as read: ${(error as Error).message}`,
        { notificationId, userId }
      );
    }
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId: string): Promise<void> {
    try {
      const unreadNotifications = await this.commentRepo.getUserNotifications(userId, true, 1000);

      // Mark each notification as read
      await Promise.all(
        unreadNotifications.map(notification =>
          this.commentRepo.markNotificationRead(notification.id)
        )
      );

      console.log(`[NotificationService] Marked all ${unreadNotifications.length} notifications as read for user ${userId}`);
    } catch (error) {
      if (error instanceof CollaborationError) {
        throw error;
      }
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        `Failed to mark all notifications as read: ${(error as Error).message}`,
        { userId }
      );
    }
  }

  /**
   * Send real-time notification to user (called by database triggers)
   * This is invoked when a mention or reply notification is created
   */
  async sendNotification(notification: Notification): Promise<void> {
    if (!this.config.enableRealtime) {
      return;
    }

    try {
      // Invoke all registered callbacks
      for (const callback of this.notificationCallbacks) {
        try {
          callback(notification.userId, notification);
        } catch (error) {
          console.error('[NotificationService] Error in notification callback:', error);
        }
      }

      console.log(`[NotificationService] Sent real-time notification to user ${notification.userId}`);
    } catch (error) {
      console.error('[NotificationService] Failed to send notification:', error);
    }
  }

  /**
   * Get recent notifications for display in notification bell
   */
  async getRecentNotifications(userId: string, limit: number = 10): Promise<Notification[]> {
    try {
      return await this.getUserNotifications(userId, false, limit);
    } catch (error) {
      if (error instanceof CollaborationError) {
        throw error;
      }
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        `Failed to get recent notifications: ${(error as Error).message}`,
        { userId }
      );
    }
  }

  /**
   * Create notification summary for email digest (future enhancement)
   */
  async createEmailDigest(userId: string): Promise<{
    unreadCount: number;
    notifications: Notification[];
    summary: string;
  }> {
    try {
      const notifications = await this.getUserNotifications(userId, true, 50);
      const unreadCount = notifications.length;

      // Group notifications by type
      const mentions = notifications.filter(n => n.type === 'mention');
      const replies = notifications.filter(n => n.type === 'reply');
      const reactions = notifications.filter(n => n.type === 'reaction');

      const summary = [
        `You have ${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}`,
        mentions.length > 0 ? `${mentions.length} mention${mentions.length !== 1 ? 's' : ''}` : null,
        replies.length > 0 ? `${replies.length} repl${replies.length !== 1 ? 'ies' : 'y'}` : null,
        reactions.length > 0 ? `${reactions.length} reaction${reactions.length !== 1 ? 's' : ''}` : null
      ].filter(Boolean).join(', ');

      return {
        unreadCount,
        notifications,
        summary
      };
    } catch (error) {
      if (error instanceof CollaborationError) {
        throw error;
      }
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        `Failed to create email digest: ${(error as Error).message}`,
        { userId }
      );
    }
  }

  /**
   * Delete old read notifications (cleanup)
   */
  async cleanupOldNotifications(daysOld: number = 30): Promise<number> {
    // This would require a new repository method
    // For now, just log the intent
    console.log(`[NotificationService] Cleanup of notifications older than ${daysOld} days would be performed here`);
    return 0;
  }

  /**
   * Get notification statistics for a user
   */
  async getNotificationStats(userId: string): Promise<{
    total: number;
    unread: number;
    byType: Record<string, number>;
  }> {
    try {
      const allNotifications = await this.getUserNotifications(userId, false, 1000);
      const unreadNotifications = await this.getUserNotifications(userId, true, 1000);

      const byType: Record<string, number> = {};
      for (const notification of allNotifications) {
        byType[notification.type] = (byType[notification.type] || 0) + 1;
      }

      return {
        total: allNotifications.length,
        unread: unreadNotifications.length,
        byType
      };
    } catch (error) {
      if (error instanceof CollaborationError) {
        throw error;
      }
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        `Failed to get notification stats: ${(error as Error).message}`,
        { userId }
      );
    }
  }
}