/**
 * ActivityLogger Tests
 * 
 * Comprehensive tests for activity logging service, including:
 * - Activity logging (immediate and queued)
 * - Session and user activity queries
 * - Activity summaries and statistics
 * - Audit trail generation
 * - CSV export
 * - Activity filtering
 * - Cleanup operations
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { ActivityLogger, LogActivityOptions, AuditTrailEntry } from '../../services/ActivityLogger.js';
import { ActivityRepository, CreateActivityParams, ActivityQueryFilters, ActivitySummary } from '../../repositories/ActivityRepository.js';
import { ActivityLog, ActivityType } from '../../types/index.js';
import { UserFactory, SessionFactory } from '../factories/index.js';
import { generateUUID } from '../setup/test-helpers.js';

// Mock ActivityRepository
class MockActivityRepository {
  private activities: ActivityLog[] = [];
  private queue: CreateActivityParams[] = [];
  
  async logActivity(params: CreateActivityParams): Promise<ActivityLog> {
    const activity: ActivityLog = {
      id: generateUUID(),
      sessionId: params.sessionId,
      userId: params.userId || undefined,
      activityType: params.activityType,
      details: params.details,
      ipAddress: params.ipAddress || undefined,
      userAgent: params.userAgent || undefined,
      createdAt: new Date(),
    };
    this.activities.push(activity);
    return activity;
  }
  
  queueActivity(params: CreateActivityParams): void {
    this.queue.push(params);
  }
  
  async getSessionActivity(sessionId: string, limit?: number): Promise<ActivityLog[]> {
    const filtered = this.activities.filter(a => a.sessionId === sessionId);
    return limit ? filtered.slice(0, limit) : filtered;
  }
  
  async getUserActivity(userId: string, limit?: number): Promise<ActivityLog[]> {
    const filtered = this.activities.filter(a => a.userId === userId);
    return limit ? filtered.slice(0, limit) : filtered;
  }
  
  async getActivities(filters: ActivityQueryFilters): Promise<ActivityLog[]> {
    let result = this.activities;
    
    if (filters.sessionId) {
      result = result.filter(a => a.sessionId === filters.sessionId);
    }
    if (filters.userId) {
      result = result.filter(a => a.userId === filters.userId);
    }
    if (filters.activityType) {
      result = result.filter(a => a.activityType === filters.activityType);
    }
    if (filters.startDate) {
      result = result.filter(a => a.createdAt >= filters.startDate!);
    }
    if (filters.endDate) {
      result = result.filter(a => a.createdAt <= filters.endDate!);
    }
    if (filters.limit) {
      result = result.slice(0, filters.limit);
    }
    
    return result;
  }
  
  async getSessionSummary(sessionId: string): Promise<ActivitySummary | null> {
    const activities = this.activities.filter(a => a.sessionId === sessionId);
    
    if (activities.length === 0) {
      return null;
    }
    
    const uniqueUsers = new Set(activities.filter(a => a.userId).map(a => a.userId)).size;
    const activityTypes: Record<string, number> = {};
    
    for (const activity of activities) {
      activityTypes[activity.activityType] = (activityTypes[activity.activityType] || 0) + 1;
    }
    
    return {
      sessionId,
      totalActivities: activities.length,
      uniqueUsers,
      activityTypes,
      firstActivity: activities[0].createdAt,
      lastActivity: activities[activities.length - 1].createdAt,
    };
  }
  
  async getActivityTimeline(sessionId: string): Promise<Array<{ hour: Date; count: number }>> {
    const activities = this.activities.filter(a => a.sessionId === sessionId);
    const hourlyCount: Map<string, number> = new Map();
    
    for (const activity of activities) {
      const hour = new Date(activity.createdAt);
      hour.setMinutes(0, 0, 0);
      const hourKey = hour.toISOString();
      hourlyCount.set(hourKey, (hourlyCount.get(hourKey) || 0) + 1);
    }
    
    return Array.from(hourlyCount.entries()).map(([hourStr, count]) => ({
      hour: new Date(hourStr),
      count,
    }));
  }
  
  async getActivityCountByType(sessionId: string): Promise<Record<string, number>> {
    const activities = this.activities.filter(a => a.sessionId === sessionId);
    const counts: Record<string, number> = {};
    
    for (const activity of activities) {
      counts[activity.activityType] = (counts[activity.activityType] || 0) + 1;
    }
    
    return counts;
  }
  
  async getRecentActivities(limit: number): Promise<ActivityLog[]> {
    return this.activities.slice(-limit);
  }
  
  async deleteOldActivities(daysOld: number): Promise<number> {
    const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
    const before = this.activities.length;
    this.activities = this.activities.filter(a => a.createdAt > cutoffDate);
    return before - this.activities.length;
  }
  
  async shutdown(): Promise<void> {
    // Process queued activities
    for (const params of this.queue) {
      await this.logActivity(params);
    }
    this.queue = [];
  }
  
  getAll(): ActivityLog[] {
    return this.activities;
  }
  
  getQueue(): CreateActivityParams[] {
    return this.queue;
  }
  
  clear(): void {
    this.activities = [];
    this.queue = [];
  }
}

describe('ActivityLogger', () => {
  let logger: ActivityLogger;
  let activityRepo: MockActivityRepository;
  let getUserName: jest.Mock<(userId: string) => Promise<string>>;
  
  beforeEach(() => {
    activityRepo = new MockActivityRepository();
    getUserName = jest.fn<(userId: string) => Promise<string>>().mockImplementation(async (userId: string) => `User_${userId.slice(0, 8)}`);
    logger = new ActivityLogger(
      activityRepo as unknown as ActivityRepository,
      getUserName
    );
  });
  
  afterEach(() => {
    activityRepo.clear();
  });
  
  describe('logActivity', () => {
    it('should log an activity', async () => {
      const session = SessionFactory.create();
      const user = UserFactory.create();
      
      const activity = await logger.logActivity(
        session.id,
        user.id,
        'user_joined',
        { role: 'operator' }
      );
      
      expect(activity).toBeDefined();
      expect(activity.sessionId).toBe(session.id);
      expect(activity.userId).toBe(user.id);
      expect(activity.activityType).toBe('user_joined');
      expect(activity.details.role).toBe('operator');
    });
    
    it('should log activity with IP address and user agent', async () => {
      const session = SessionFactory.create();
      const user = UserFactory.create();
      
      const activity = await logger.logActivity(
        session.id,
        user.id,
        'user_joined',
        { role: 'viewer' },
        '192.168.1.1',
        'Mozilla/5.0'
      );
      
      expect(activity.ipAddress).toBe('192.168.1.1');
      expect(activity.userAgent).toBe('Mozilla/5.0');
    });
    
    it('should handle null userId', async () => {
      const session = SessionFactory.create();
      
      const activity = await logger.logActivity(
        session.id,
        null,
        'action_taken',
        { action: 'system_init' }
      );
      
      expect(activity.userId).toBeUndefined();
    });
  });
  
  describe('queueActivity', () => {
    it('should queue activity for bulk insert', () => {
      const session = SessionFactory.create();
      const user = UserFactory.create();
      
      const options: LogActivityOptions = {
        sessionId: session.id,
        userId: user.id,
        activityType: 'comment_added',
        details: { commentId: generateUUID() },
      };
      
      logger.queueActivity(options);
      
      expect(activityRepo.getQueue()).toHaveLength(1);
      expect(activityRepo.getAll()).toHaveLength(0); // Not logged yet
    });
    
    it('should log immediately when immediate flag is true', async () => {
      const session = SessionFactory.create();
      const user = UserFactory.create();
      
      const options: LogActivityOptions = {
        sessionId: session.id,
        userId: user.id,
        activityType: 'user_joined',
        details: { role: 'operator' },
        immediate: true,
      };
      
      logger.queueActivity(options);
      
      // Give async operation time to complete
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(activityRepo.getQueue()).toHaveLength(0);
      expect(activityRepo.getAll().length).toBeGreaterThan(0);
    });
  });
  
  describe('convenience methods', () => {
    it('should log user joined', async () => {
      const session = SessionFactory.create();
      const user = UserFactory.create();
      
      await logger.logUserJoined(session.id, user.id, 'operator', '192.168.1.1');
      
      const activities = activityRepo.getAll();
      expect(activities).toHaveLength(1);
      expect(activities[0].activityType).toBe('user_joined');
      expect(activities[0].details.role).toBe('operator');
      expect(activities[0].ipAddress).toBe('192.168.1.1');
    });
    
    it('should log user left', async () => {
      const session = SessionFactory.create();
      const user = UserFactory.create();
      
      await logger.logUserLeft(session.id, user.id, 300000); // 5 minutes
      
      const activities = activityRepo.getAll();
      expect(activities).toHaveLength(1);
      expect(activities[0].activityType).toBe('user_left');
      expect(activities[0].details.duration).toBe(300000);
    });
    
    it('should log comment added', async () => {
      const session = SessionFactory.create();
      const user = UserFactory.create();
      const commentId = generateUUID();
      
      await logger.logCommentAdded(session.id, user.id, commentId, 'event', 'evt_123');
      
      const activities = activityRepo.getAll();
      expect(activities).toHaveLength(1);
      expect(activities[0].activityType).toBe('comment_added');
      expect(activities[0].details.commentId).toBe(commentId);
      expect(activities[0].details.targetType).toBe('event');
    });
    
    it('should log action taken', async () => {
      const session = SessionFactory.create();
      const user = UserFactory.create();
      
      await logger.logActionTaken(session.id, user.id, 'run_scan', 'target_host', 'success');
      
      const activities = activityRepo.getAll();
      expect(activities).toHaveLength(1);
      expect(activities[0].activityType).toBe('action_taken');
      expect(activities[0].details.action).toBe('run_scan');
      expect(activities[0].details.result).toBe('success');
    });
  });
  
  describe('getSessionActivity', () => {
    it('should get all activities for a session', async () => {
      const session = SessionFactory.create();
      const user = UserFactory.create();
      
      await logger.logUserJoined(session.id, user.id, 'operator');
      await logger.logCommentAdded(session.id, user.id, generateUUID(), 'event', 'evt_1');
      await logger.logUserLeft(session.id, user.id);
      
      const activities = await logger.getSessionActivity(session.id);
      
      expect(activities).toHaveLength(3);
      expect(activities.every(a => a.sessionId === session.id)).toBe(true);
    });
    
    it('should respect limit parameter', async () => {
      const session = SessionFactory.create();
      const user = UserFactory.create();
      
      for (let i = 0; i < 10; i++) {
        await logger.logActivity(session.id, user.id, 'user_joined', {});
      }
      
      const activities = await logger.getSessionActivity(session.id, 5);
      
      expect(activities).toHaveLength(5);
    });
  });
  
  describe('getUserActivity', () => {
    it('should get all activities for a user', async () => {
      const user = UserFactory.create();
      const sessions = SessionFactory.createMany(3);
      
      for (const session of sessions) {
        await logger.logUserJoined(session.id, user.id, 'operator');
      }
      
      const activities = await logger.getUserActivity(user.id);
      
      expect(activities).toHaveLength(3);
      expect(activities.every(a => a.userId === user.id)).toBe(true);
    });
  });
  
  describe('getActivities with filters', () => {
    it('should filter by activity type', async () => {
      const session = SessionFactory.create();
      const user = UserFactory.create();
      
      await logger.logUserJoined(session.id, user.id, 'operator');
      await logger.logCommentAdded(session.id, user.id, generateUUID(), 'event', 'evt_1');
      await logger.logUserLeft(session.id, user.id);
      
      const activities = await logger.getActivities({ activityType: 'comment_added' });
      
      expect(activities).toHaveLength(1);
      expect(activities[0].activityType).toBe('comment_added');
    });
    
    it('should filter by date range', async () => {
      const session = SessionFactory.create();
      const user = UserFactory.create();
      
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      await logger.logActivity(session.id, user.id, 'user_joined', {});
      
      // Capture 'now' after logging to ensure activity timestamp is within range
      const now = new Date(Date.now() + 1000); // Add 1 second buffer
      
      const activities = await logger.getActivities({
        startDate: yesterday,
        endDate: now,
      });
      
      expect(activities.length).toBeGreaterThan(0);
    });
  });
  
  describe('getSessionSummary', () => {
    it('should generate session summary', async () => {
      const session = SessionFactory.create();
      const users = UserFactory.createMany(3);
      
      for (const user of users) {
        await logger.logUserJoined(session.id, user.id, 'operator');
        await logger.logCommentAdded(session.id, user.id, generateUUID(), 'event', 'evt_1');
      }
      
      const summary = await logger.getSessionSummary(session.id);
      
      expect(summary).not.toBeNull();
      expect(summary!.totalActivities).toBe(6); // 3 joins + 3 comments
      expect(summary!.uniqueUsers).toBe(3);
      expect(summary!.activityTypes['user_joined']).toBe(3);
      expect(summary!.activityTypes['comment_added']).toBe(3);
    });
    
    it('should return null for session with no activities', async () => {
      const session = SessionFactory.create();
      
      const summary = await logger.getSessionSummary(session.id);
      
      expect(summary).toBeNull();
    });
  });
  
  describe('getActivityTimeline', () => {
    it('should return hourly activity counts', async () => {
      const session = SessionFactory.create();
      const user = UserFactory.create();
      
      // Log several activities
      for (let i = 0; i < 5; i++) {
        await logger.logActivity(session.id, user.id, 'user_joined', {});
      }
      
      const timeline = await logger.getActivityTimeline(session.id);
      
      expect(timeline.length).toBeGreaterThan(0);
      expect(timeline[0]).toHaveProperty('hour');
      expect(timeline[0]).toHaveProperty('count');
    });
  });
  
  describe('getActivityCountByType', () => {
    it('should count activities by type', async () => {
      const session = SessionFactory.create();
      const user = UserFactory.create();
      
      await logger.logUserJoined(session.id, user.id, 'operator');
      await logger.logUserJoined(session.id, user.id, 'operator');
      await logger.logCommentAdded(session.id, user.id, generateUUID(), 'event', 'evt_1');
      await logger.logUserLeft(session.id, user.id);
      
      const counts = await logger.getActivityCountByType(session.id);
      
      expect(counts['user_joined']).toBe(2);
      expect(counts['comment_added']).toBe(1);
      expect(counts['user_left']).toBe(1);
    });
  });
  
  describe('getRecentActivities', () => {
    it('should get recent activities across all sessions', async () => {
      const sessions = SessionFactory.createMany(3);
      const user = UserFactory.create();
      
      for (const session of sessions) {
        await logger.logUserJoined(session.id, user.id, 'operator');
      }
      
      const activities = await logger.getRecentActivities(5);
      
      expect(activities.length).toBeGreaterThan(0);
      expect(activities.length).toBeLessThanOrEqual(5);
    });
  });
  
  describe('generateAuditTrail', () => {
    it('should generate audit trail with usernames', async () => {
      const session = SessionFactory.create();
      const user = UserFactory.create();
      
      await logger.logUserJoined(session.id, user.id, 'operator');
      await logger.logCommentAdded(session.id, user.id, generateUUID(), 'event', 'evt_1');
      
      const auditTrail = await logger.generateAuditTrail(session.id);
      
      expect(auditTrail).toHaveLength(2);
      expect(auditTrail[0].sessionId).toBe(session.id);
      expect(auditTrail[0].userId).toBe(user.id);
      expect(auditTrail[0].username).toBeDefined();
      expect(auditTrail[0].description).toContain('User joined session');
    });
    
    it('should handle missing usernames gracefully', async () => {
      getUserName.mockRejectedValue(new Error('User not found'));
      
      const session = SessionFactory.create();
      const user = UserFactory.create();
      
      await logger.logUserJoined(session.id, user.id, 'operator');
      
      const auditTrail = await logger.generateAuditTrail(session.id);
      
      expect(auditTrail).toHaveLength(1);
      expect(auditTrail[0].username).toBeUndefined();
    });
  });
  
  describe('exportAuditTrailCSV', () => {
    it('should export audit trail as CSV', async () => {
      const session = SessionFactory.create();
      const user = UserFactory.create();
      
      await logger.logUserJoined(session.id, user.id, 'operator');
      await logger.logUserLeft(session.id, user.id);
      
      const csv = await logger.exportAuditTrailCSV(session.id);
      
      expect(csv).toContain('Timestamp,Session ID,User ID,Username,Activity Type,Description');
      expect(csv).toContain('user_joined');
      expect(csv).toContain('user_left');
    });
    
    it('should escape quotes in descriptions', async () => {
      const session = SessionFactory.create();
      const user = UserFactory.create();
      
      await logger.logActivity(session.id, user.id, 'action_taken', {
        action: 'test "quoted" action',
      });
      
      const csv = await logger.exportAuditTrailCSV(session.id);
      
      expect(csv).toContain('""');
    });
  });
  
  describe('getActivityStatistics', () => {
    it('should calculate comprehensive statistics', async () => {
      const session = SessionFactory.create();
      const users = UserFactory.createMany(3);
      
      for (const user of users) {
        await logger.logUserJoined(session.id, user.id, 'operator');
        await logger.logCommentAdded(session.id, user.id, generateUUID(), 'event', 'evt_1');
      }
      
      const stats = await logger.getActivityStatistics(session.id);
      
      expect(stats.totalActivities).toBe(6);
      expect(stats.uniqueUsers).toBe(3);
      expect(stats.activityTypes['user_joined']).toBe(3);
      expect(stats.activityTypes['comment_added']).toBe(3);
      expect(stats.peakHour).toBeDefined();
      expect(stats.averageActivitiesPerHour).toBeGreaterThanOrEqual(0);
    });
    
    it('should return zero stats for session with no activities', async () => {
      const session = SessionFactory.create();
      
      const stats = await logger.getActivityStatistics(session.id);
      
      expect(stats.totalActivities).toBe(0);
      expect(stats.uniqueUsers).toBe(0);
      expect(stats.activityTypes).toEqual({});
      expect(stats.peakHour).toBeNull();
      expect(stats.averageActivitiesPerHour).toBe(0);
    });
  });
  
  describe('cleanupOldActivities', () => {
    it('should delete activities older than specified days', async () => {
      const session = SessionFactory.create();
      const user = UserFactory.create();
      
      // Log some activities
      await logger.logActivity(session.id, user.id, 'user_joined', {});
      await logger.logActivity(session.id, user.id, 'user_left', {});
      
      // Cleanup activities older than 0 days (should delete all)
      const deleted = await logger.cleanupOldActivities(0);
      
      expect(deleted).toBeGreaterThan(0);
    });
  });
  
  describe('shutdown', () => {
    it('should flush queued activities', async () => {
      const session = SessionFactory.create();
      const user = UserFactory.create();
      
      // Queue some activities
      logger.queueActivity({
        sessionId: session.id,
        userId: user.id,
        activityType: 'user_joined',
        details: { role: 'operator' },
      });
      
      expect(activityRepo.getQueue()).toHaveLength(1);
      expect(activityRepo.getAll()).toHaveLength(0);
      
      await logger.shutdown();
      
      expect(activityRepo.getQueue()).toHaveLength(0);
      expect(activityRepo.getAll()).toHaveLength(1);
    });
  });
});