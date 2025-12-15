/**
 * NotificationService Tests
 * 
 * Comprehensive tests for user notifications, including:
 * - Getting user notifications (all/unread)
 * - Getting unread counts
 * - Marking notifications as read (single/batch)
 * - Real-time notification delivery via callbacks
 * - Recent notifications for notification bell
 * - Email digest creation
 * - Notification statistics
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { NotificationService, NotificationConfig } from '../../services/NotificationService.js';
import { CommentRepository } from '../../repositories/CommentRepository.js';
import { Notification, NotificationType, CollaborationError } from '../../types/index.js';
import { UserFactory, NotificationFactory } from '../factories/index.js';
import { generateUUID } from '../setup/test-helpers.js';

// Mock CommentRepository
class MockCommentRepository {
  private notifications: Notification[] = [];
  
  async getUserNotifications(userId: string, unreadOnly: boolean, limit: number): Promise<Notification[]> {
    let filtered = this.notifications.filter(n => n.userId === userId);
    
    if (unreadOnly) {
      filtered = filtered.filter(n => !n.isRead);
    }
    
    return filtered.slice(0, limit);
  }
  
  async getUnreadNotificationCount(userId: string): Promise<number> {
    return this.notifications.filter(n => n.userId === userId && !n.isRead).length;
  }
  
  async markNotificationRead(notificationId: string): Promise<void> {
    const notification = this.notifications.find(n => n.id === notificationId);
    if (notification) {
      notification.isRead = true;
    }
  }
  
  addNotification(notification: Notification): void {
    this.notifications.push(notification);
  }
  
  addNotifications(notifications: Notification[]): void {
    this.notifications.push(...notifications);
  }
  
  clear(): void {
    this.notifications = [];
  }
  
  getAll(): Notification[] {
    return this.notifications;
  }
}

describe('NotificationService', () => {
  let service: NotificationService;
  let commentRepo: MockCommentRepository;
  let config: NotificationConfig;
  
  beforeEach(() => {
    config = {
      enableRealtime: true,
      enableEmailDigest: false,
      emailDigestIntervalHours: 24,
      maxNotificationsPerQuery: 100,
    };
    
    commentRepo = new MockCommentRepository();
    service = new NotificationService(
      commentRepo as unknown as CommentRepository,
      config
    );
  });
  
  describe('getUserNotifications', () => {
    it('should get all notifications for a user', async () => {
      const user = UserFactory.create();
      const notifications = NotificationFactory.createMany(5, { userId: user.id });
      
      commentRepo.addNotifications(notifications);
      
      const result = await service.getUserNotifications(user.id, false);
      
      expect(result).toHaveLength(5);
      expect(result.every(n => n.userId === user.id)).toBe(true);
    });
    
    it('should get only unread notifications when unreadOnly is true', async () => {
      const user = UserFactory.create();
      const readNotifications = NotificationFactory.createMany(2, { 
        userId: user.id,
        isRead: true
      });
      const unreadNotifications = NotificationFactory.createMany(3, {
        userId: user.id,
        isRead: false
      });
      
      commentRepo.addNotifications([...readNotifications, ...unreadNotifications]);
      
      const result = await service.getUserNotifications(user.id, true);
      
      expect(result).toHaveLength(3);
      expect(result.every(n => !n.isRead)).toBe(true);
    });
    
    it('should respect limit parameter', async () => {
      const user = UserFactory.create();
      const notifications = NotificationFactory.createMany(10, { userId: user.id });
      
      commentRepo.addNotifications(notifications);
      
      const result = await service.getUserNotifications(user.id, false, 5);
      
      expect(result).toHaveLength(5);
    });
    
    it('should enforce max limit from config', async () => {
      const user = UserFactory.create();
      const notifications = NotificationFactory.createMany(150, { userId: user.id });
      
      commentRepo.addNotifications(notifications);
      
      // Request more than config max (100)
      const result = await service.getUserNotifications(user.id, false, 200);
      
      expect(result.length).toBeLessThanOrEqual(config.maxNotificationsPerQuery);
    });
    
    it('should return empty array when user has no notifications', async () => {
      const user = UserFactory.create();
      
      const result = await service.getUserNotifications(user.id, false);
      
      expect(result).toEqual([]);
    });
    
    it('should only return notifications for specified user', async () => {
      const user1 = UserFactory.create();
      const user2 = UserFactory.create();
      
      const user1Notifications = NotificationFactory.createMany(3, { userId: user1.id });
      const user2Notifications = NotificationFactory.createMany(2, { userId: user2.id });
      
      commentRepo.addNotifications([...user1Notifications, ...user2Notifications]);
      
      const result = await service.getUserNotifications(user1.id, false);
      
      expect(result).toHaveLength(3);
      expect(result.every(n => n.userId === user1.id)).toBe(true);
    });
  });
  
  describe('getUnreadCount', () => {
    it('should return correct unread count', async () => {
      const user = UserFactory.create();
      const readNotifications = NotificationFactory.createMany(2, {
        userId: user.id,
        isRead: true
      });
      const unreadNotifications = NotificationFactory.createMany(5, {
        userId: user.id,
        isRead: false
      });
      
      commentRepo.addNotifications([...readNotifications, ...unreadNotifications]);
      
      const count = await service.getUnreadCount(user.id);
      
      expect(count).toBe(5);
    });
    
    it('should return 0 when user has no unread notifications', async () => {
      const user = UserFactory.create();
      const notifications = NotificationFactory.createMany(3, {
        userId: user.id,
        isRead: true
      });
      
      commentRepo.addNotifications(notifications);
      
      const count = await service.getUnreadCount(user.id);
      
      expect(count).toBe(0);
    });
    
    it('should return 0 when user has no notifications', async () => {
      const user = UserFactory.create();
      
      const count = await service.getUnreadCount(user.id);
      
      expect(count).toBe(0);
    });
  });
  
  describe('markAsRead', () => {
    it('should mark notification as read', async () => {
      const user = UserFactory.create();
      const notification = NotificationFactory.create({
        userId: user.id,
        isRead: false
      });
      
      commentRepo.addNotification(notification);
      
      await service.markAsRead(notification.id, user.id);
      
      const updated = commentRepo.getAll().find(n => n.id === notification.id);
      expect(updated?.isRead).toBe(true);
    });
    
    it('should throw error if notification does not belong to user', async () => {
      const user1 = UserFactory.create();
      const user2 = UserFactory.create();
      const notification = NotificationFactory.create({
        userId: user1.id,
        isRead: false
      });
      
      commentRepo.addNotification(notification);
      
      await expect(
        service.markAsRead(notification.id, user2.id)
      ).rejects.toThrow('Notification not found or does not belong to user');
    });
    
    it('should throw error if notification not found', async () => {
      const user = UserFactory.create();
      
      await expect(
        service.markAsRead('nonexistent_id', user.id)
      ).rejects.toThrow('Notification not found or does not belong to user');
    });
  });
  
  describe('markAllAsRead', () => {
    it('should mark all unread notifications as read', async () => {
      const user = UserFactory.create();
      const notifications = NotificationFactory.createMany(5, {
        userId: user.id,
        isRead: false
      });
      
      commentRepo.addNotifications(notifications);
      
      await service.markAllAsRead(user.id);
      
      const unreadCount = await service.getUnreadCount(user.id);
      expect(unreadCount).toBe(0);
    });
    
    it('should not affect already read notifications', async () => {
      const user = UserFactory.create();
      const readNotifications = NotificationFactory.createMany(2, {
        userId: user.id,
        isRead: true
      });
      const unreadNotifications = NotificationFactory.createMany(3, {
        userId: user.id,
        isRead: false
      });
      
      commentRepo.addNotifications([...readNotifications, ...unreadNotifications]);
      
      await service.markAllAsRead(user.id);
      
      const allNotifications = await service.getUserNotifications(user.id, false);
      expect(allNotifications).toHaveLength(5);
      expect(allNotifications.every(n => n.isRead)).toBe(true);
    });
    
    it('should handle user with no notifications', async () => {
      const user = UserFactory.create();
      
      await expect(service.markAllAsRead(user.id)).resolves.not.toThrow();
    });
  });
  
  describe('sendNotification', () => {
    it('should invoke registered callbacks', async () => {
      const notification = NotificationFactory.create();
      let receivedUserId: string | null = null;
      let receivedNotification: Notification | null = null;
      
      service.onNotification((userId, notif) => {
        receivedUserId = userId;
        receivedNotification = notif;
      });
      
      await service.sendNotification(notification);
      
      expect(receivedUserId).toBe(notification.userId);
      expect(receivedNotification).toEqual(notification);
    });
    
    it('should invoke multiple callbacks', async () => {
      const notification = NotificationFactory.create();
      let callCount = 0;
      
      service.onNotification(() => { callCount++; });
      service.onNotification(() => { callCount++; });
      service.onNotification(() => { callCount++; });
      
      await service.sendNotification(notification);
      
      expect(callCount).toBe(3);
    });
    
    it('should not send notifications when realtime disabled', async () => {
      const noRealtimeService = new NotificationService(
        commentRepo as unknown as CommentRepository,
        { enableRealtime: false }
      );
      
      const notification = NotificationFactory.create();
      let callCount = 0;
      
      noRealtimeService.onNotification(() => { callCount++; });
      
      await noRealtimeService.sendNotification(notification);
      
      expect(callCount).toBe(0);
    });
    
    it('should handle callback errors gracefully', async () => {
      const notification = NotificationFactory.create();
      let successfulCallCount = 0;
      
      service.onNotification(() => {
        throw new Error('Callback error');
      });
      service.onNotification(() => {
        successfulCallCount++;
      });
      
      // Should not throw
      await expect(service.sendNotification(notification)).resolves.not.toThrow();
      expect(successfulCallCount).toBe(1);
    });
  });
  
  describe('onNotification / offNotification', () => {
    it('should register callback', async () => {
      let called = false;
      const callback = () => { called = true; };
      
      service.onNotification(callback);
      
      const notification = NotificationFactory.create();
      await service.sendNotification(notification);
      
      expect(called).toBe(true);
    });
    
    it('should unregister callback', async () => {
      let callCount = 0;
      const callback = () => { callCount++; };
      
      service.onNotification(callback);
      
      const notification1 = NotificationFactory.create();
      await service.sendNotification(notification1);
      expect(callCount).toBe(1);
      
      service.offNotification(callback);
      
      const notification2 = NotificationFactory.create();
      await service.sendNotification(notification2);
      expect(callCount).toBe(1); // Should not increase
    });
  });
  
  describe('getRecentNotifications', () => {
    it('should get recent notifications with default limit', async () => {
      const user = UserFactory.create();
      const notifications = NotificationFactory.createMany(20, { userId: user.id });
      
      commentRepo.addNotifications(notifications);
      
      const result = await service.getRecentNotifications(user.id);
      
      expect(result).toHaveLength(10); // Default limit
    });
    
    it('should respect custom limit', async () => {
      const user = UserFactory.create();
      const notifications = NotificationFactory.createMany(20, { userId: user.id });
      
      commentRepo.addNotifications(notifications);
      
      const result = await service.getRecentNotifications(user.id, 5);
      
      expect(result).toHaveLength(5);
    });
    
    it('should include both read and unread notifications', async () => {
      const user = UserFactory.create();
      const readNotifications = NotificationFactory.createMany(3, {
        userId: user.id,
        isRead: true
      });
      const unreadNotifications = NotificationFactory.createMany(2, {
        userId: user.id,
        isRead: false
      });
      
      commentRepo.addNotifications([...readNotifications, ...unreadNotifications]);
      
      const result = await service.getRecentNotifications(user.id);
      
      expect(result).toHaveLength(5);
    });
  });
  
  describe('createEmailDigest', () => {
    it('should create digest with correct counts', async () => {
      const user = UserFactory.create();
      const mentions = NotificationFactory.createMany(2, {
        userId: user.id,
        type: 'mention',
        isRead: false
      });
      const replies = NotificationFactory.createMany(3, {
        userId: user.id,
        type: 'reply',
        isRead: false
      });
      const reactions = NotificationFactory.createMany(1, {
        userId: user.id,
        type: 'reaction',
        isRead: false
      });
      
      commentRepo.addNotifications([...mentions, ...replies, ...reactions]);
      
      const digest = await service.createEmailDigest(user.id);
      
      expect(digest.unreadCount).toBe(6);
      expect(digest.notifications).toHaveLength(6);
      expect(digest.summary).toContain('6 unread notifications');
      expect(digest.summary).toContain('2 mentions');
      expect(digest.summary).toContain('3 replies');
      expect(digest.summary).toContain('1 reaction');
    });
    
    it('should handle singular forms correctly', async () => {
      const user = UserFactory.create();
      const notification = NotificationFactory.create({
        userId: user.id,
        type: 'mention',
        isRead: false
      });
      
      commentRepo.addNotification(notification);
      
      const digest = await service.createEmailDigest(user.id);
      
      expect(digest.summary).toContain('1 unread notification');
      expect(digest.summary).toContain('1 mention');
    });
    
    it('should handle no unread notifications', async () => {
      const user = UserFactory.create();
      const notifications = NotificationFactory.createMany(3, {
        userId: user.id,
        isRead: true
      });
      
      commentRepo.addNotifications(notifications);
      
      const digest = await service.createEmailDigest(user.id);
      
      expect(digest.unreadCount).toBe(0);
      expect(digest.notifications).toHaveLength(0);
      expect(digest.summary).toContain('0 unread notifications');
    });
    
    it('should limit notifications to 50', async () => {
      const user = UserFactory.create();
      const notifications = NotificationFactory.createMany(100, {
        userId: user.id,
        isRead: false
      });
      
      commentRepo.addNotifications(notifications);
      
      const digest = await service.createEmailDigest(user.id);
      
      expect(digest.notifications.length).toBeLessThanOrEqual(50);
    });
  });
  
  describe('getNotificationStats', () => {
    it('should return correct statistics', async () => {
      const user = UserFactory.create();
      const mentions = NotificationFactory.createMany(3, {
        userId: user.id,
        type: 'mention',
        isRead: false
      });
      const replies = NotificationFactory.createMany(2, {
        userId: user.id,
        type: 'reply',
        isRead: true
      });
      const reactions = NotificationFactory.createMany(1, {
        userId: user.id,
        type: 'reaction',
        isRead: false
      });
      
      commentRepo.addNotifications([...mentions, ...replies, ...reactions]);
      
      const stats = await service.getNotificationStats(user.id);
      
      expect(stats.total).toBe(6);
      expect(stats.unread).toBe(4);
      expect(stats.byType['mention']).toBe(3);
      expect(stats.byType['reply']).toBe(2);
      expect(stats.byType['reaction']).toBe(1);
    });
    
    it('should handle user with no notifications', async () => {
      const user = UserFactory.create();
      
      const stats = await service.getNotificationStats(user.id);
      
      expect(stats.total).toBe(0);
      expect(stats.unread).toBe(0);
      expect(stats.byType).toEqual({});
    });
    
    it('should handle all read notifications', async () => {
      const user = UserFactory.create();
      const notifications = NotificationFactory.createMany(5, {
        userId: user.id,
        isRead: true
      });
      
      commentRepo.addNotifications(notifications);
      
      const stats = await service.getNotificationStats(user.id);
      
      expect(stats.total).toBe(5);
      expect(stats.unread).toBe(0);
    });
  });
  
  describe('cleanupOldNotifications', () => {
    it('should return 0 (placeholder implementation)', async () => {
      const result = await service.cleanupOldNotifications(30);
      
      expect(result).toBe(0);
    });
    
    it('should accept custom days parameter', async () => {
      const result = await service.cleanupOldNotifications(7);
      
      expect(result).toBe(0);
    });
  });
});