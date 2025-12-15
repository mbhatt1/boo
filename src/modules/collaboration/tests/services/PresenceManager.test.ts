/**
 * PresenceManager Unit Tests
 *
 * Tests for presence tracking including online/offline status,
 * heartbeat monitoring, cursor tracking, and Redis integration.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { PresenceManager } from '../../services/PresenceManager.js';
import { RedisClient } from '../../redis/RedisClient.js';
import type { PresenceUser, CursorPosition, UserStatus } from '../../types/index.js';

describe('PresenceManager', () => {
  let presenceManager: PresenceManager;
  let mockRedisClient: jest.Mocked<RedisClient>;

  const testSessionId = 'test-session-123';
  const testUserId = 'user-456';
  const testUsername = 'testuser';

  beforeEach(() => {
    mockRedisClient = {
      set: jest.fn(),
      get: jest.fn(),
      zadd: jest.fn(),
      zrange: jest.fn(),
      zrem: jest.fn(),
      del: jest.fn(),
      isReady: jest.fn(() => true),
      publish: jest.fn(),
      subscribe: jest.fn(),
      close: jest.fn(),
    } as any;

    presenceManager = new PresenceManager(mockRedisClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('setPresence', () => {
    it('should set user presence as online', async () => {
      mockRedisClient.set.mockResolvedValueOnce('OK' as any);
      mockRedisClient.zadd.mockResolvedValueOnce(1 as any);
      mockRedisClient.publish.mockResolvedValueOnce(1 as any);

      await presenceManager.setPresence(
        testSessionId,
        testUserId,
        'online' as UserStatus
      );

      expect(mockRedisClient.set).toHaveBeenCalled();
      expect(mockRedisClient.zadd).toHaveBeenCalled();
      expect(mockRedisClient.publish).toHaveBeenCalled();
    });

    it('should set user presence as away', async () => {
      mockRedisClient.set.mockResolvedValueOnce('OK' as any);
      mockRedisClient.zadd.mockResolvedValueOnce(1 as any);
      mockRedisClient.publish.mockResolvedValueOnce(1 as any);

      await presenceManager.setPresence(
        testSessionId,
        testUserId,
        'away' as UserStatus
      );

      expect(mockRedisClient.set).toHaveBeenCalled();
      expect(mockRedisClient.zadd).toHaveBeenCalled();
      expect(mockRedisClient.publish).toHaveBeenCalled();
    });

    it('should include cursor when provided', async () => {
      mockRedisClient.set.mockResolvedValueOnce('OK' as any);
      mockRedisClient.zadd.mockResolvedValueOnce(1 as any);
      mockRedisClient.publish.mockResolvedValueOnce(1 as any);

      const cursor: CursorPosition = {
        eventId: 'evt-123',
        position: 100
      };

      await presenceManager.setPresence(
        testSessionId,
        testUserId,
        'online' as UserStatus,
        cursor
      );

      expect(mockRedisClient.set).toHaveBeenCalled();
      expect(mockRedisClient.zadd).toHaveBeenCalled();
    });
  });

  describe('getOnlineUsers', () => {
    it('should retrieve all users in a session', async () => {
      const mockUserIds = ['user-1', 'user-2'];
      const mockPresenceData = {
        userId: 'user-1',
        username: 'user1',
        role: 'viewer',
        status: 'online',
        lastSeen: Date.now()
      };

      mockRedisClient.zrange.mockResolvedValueOnce(mockUserIds);
      mockRedisClient.get.mockResolvedValue(JSON.stringify(mockPresenceData));

      const users = await presenceManager.getOnlineUsers(testSessionId);

      expect(users.length).toBeGreaterThan(0);
      expect(mockRedisClient.zrange).toHaveBeenCalled();
    });

    it('should return empty array for empty session', async () => {
      mockRedisClient.zrange.mockResolvedValueOnce([]);

      const users = await presenceManager.getOnlineUsers('empty-session');

      expect(users).toEqual([]);
    });
  });

  describe('removePresence', () => {
    it('should remove user from session', async () => {
      mockRedisClient.del.mockResolvedValueOnce(1);
      mockRedisClient.zrem.mockResolvedValueOnce(1);
      mockRedisClient.publish.mockResolvedValueOnce(1 as any);

      await presenceManager.removePresence(testSessionId, testUserId);

      expect(mockRedisClient.del).toHaveBeenCalled();
      expect(mockRedisClient.publish).toHaveBeenCalled();
    });
  });

  describe('updateCursor', () => {
    it('should update user cursor position', async () => {
      const cursor: CursorPosition = {
        eventId: 'evt-789',
        position: 150
      };

      const mockPresenceData = {
        userId: testUserId,
        username: testUsername,
        role: 'viewer',
        status: 'online',
        lastSeen: Date.now()
      };

      mockRedisClient.get.mockResolvedValueOnce(JSON.stringify(mockPresenceData));
      mockRedisClient.set.mockResolvedValueOnce('OK' as any);
      mockRedisClient.publish.mockResolvedValueOnce(1 as any);

      await presenceManager.updateCursor(
        testSessionId,
        testUserId,
        cursor
      );

      expect(mockRedisClient.set).toHaveBeenCalled();
      expect(mockRedisClient.publish).toHaveBeenCalled();
    });
  });

  describe('subscribeToPresence', () => {
    it('should subscribe to session presence channel', async () => {
      const callback = jest.fn();

      mockRedisClient.subscribe.mockResolvedValueOnce(undefined);

      await presenceManager.subscribeToPresence(testSessionId, callback);

      expect(mockRedisClient.subscribe).toHaveBeenCalled();
    });

    it('should call callback with parsed presence data', async () => {
      const callback = jest.fn();
      const mockEvent = {
        type: 'online' as const,
        sessionId: testSessionId,
        userId: testUserId,
        timestamp: Date.now(),
      };

      let subscriptionCallback: (channel: string, message: string) => void;

      mockRedisClient.subscribe.mockImplementationOnce(async (channel, cb) => {
        subscriptionCallback = cb;
      });

      await presenceManager.subscribeToPresence(testSessionId, callback);

      // Simulate incoming presence update
      subscriptionCallback!('presence:test', JSON.stringify(mockEvent));

      expect(callback).toHaveBeenCalledWith(mockEvent);
    });
  });

  describe('error handling', () => {
    it('should handle Redis errors gracefully', async () => {
      mockRedisClient.set.mockRejectedValueOnce(
        new Error('Redis connection failed')
      );

      await expect(
        presenceManager.setPresence(
          testSessionId,
          testUserId,
          'online' as UserStatus
        )
      ).rejects.toThrow();
    });
  });
});