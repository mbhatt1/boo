/**
 * Session and Presence Integration Tests
 * 
 * Tests the integration between SessionManager and PresenceManager
 * to ensure proper coordination of user sessions and presence tracking.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { SessionManager } from '../../services/SessionManager.js';
import { PresenceManager } from '../../services/PresenceManager.js';
import { SessionRepository } from '../../repositories/SessionRepository.js';
import { RedisClient } from '../../redis/RedisClient.js';
import { SessionFactory, UserFactory } from '../factories/index.js';
import { sleep } from '../setup/test-helpers.js';

describe('Session and Presence Integration', () => {
  let sessionManager: SessionManager;
  let presenceManager: PresenceManager;
  let mockSessionRepo: jest.Mocked<SessionRepository>;
  let mockRedis: jest.Mocked<RedisClient>;

  beforeEach(() => {
    // Create mocks
    mockSessionRepo = {
      createSession: jest.fn(),
      getSessionById: jest.fn(),
      getSessionBySessionId: jest.fn(),
      addParticipant: jest.fn(),
      removeParticipant: jest.fn(),
      getActiveParticipants: jest.fn(),
      getParticipantCount: jest.fn(),
      isParticipant: jest.fn(),
      updateSession: jest.fn(),
      getActiveSessions: jest.fn(),
      getSessionsByOwner: jest.fn(),
      cleanupOldSessions: jest.fn(),
    } as any;

    mockRedis = {
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

    sessionManager = new SessionManager(mockSessionRepo, 50);
    presenceManager = new PresenceManager(mockRedis);
  });

  describe('User Joining Session', () => {
    it('should create session and set user presence', async () => {
      const user = UserFactory.createOperator();
      const session = SessionFactory.create({ ownerId: user.id });

      mockSessionRepo.createSession.mockResolvedValueOnce(session);
      mockSessionRepo.addParticipant.mockResolvedValueOnce({
        userId: user.id,
        role: 'operator',
        joinedAt: new Date(),
      } as any);

      mockRedis.set.mockResolvedValueOnce('OK' as any);
      mockRedis.zadd.mockResolvedValueOnce(1 as any);
      mockRedis.publish.mockResolvedValueOnce(1 as any);

      // Create session
      const createdSession = await sessionManager.createSession(
        user.id,
        'op_001',
        { target: 'paper_001', objective: 'Test objective' }
      );

      // Set presence for user in session
      await presenceManager.setPresence(
        createdSession.sessionId,
        user.id,
        'online'
      );

      expect(mockSessionRepo.createSession).toHaveBeenCalled();
      expect(mockSessionRepo.addParticipant).toHaveBeenCalledWith(
        createdSession.id,
        user.id,
        'operator'
      );
      expect(mockRedis.set).toHaveBeenCalled();
      expect(mockRedis.publish).toHaveBeenCalled();
    });

    it('should handle multiple users joining same session', async () => {
      const user1 = UserFactory.createOperator();
      const user2 = UserFactory.createViewer();
      const session = SessionFactory.createActive();

      mockSessionRepo.getSessionBySessionId.mockResolvedValue(session);
      mockSessionRepo.addParticipant.mockResolvedValue({} as any);
      mockSessionRepo.getParticipantCount.mockResolvedValue(2);

      mockRedis.set.mockResolvedValue('OK' as any);
      mockRedis.zadd.mockResolvedValue(1 as any);
      mockRedis.publish.mockResolvedValue(1 as any);

      // User 1 joins
      await sessionManager.addParticipant(session.id, user1.id, 'operator');
      await presenceManager.setPresence(session.sessionId, user1.id, 'online');

      // User 2 joins
      await sessionManager.addParticipant(session.id, user2.id, 'viewer');
      await presenceManager.setPresence(session.sessionId, user2.id, 'online');

      expect(mockSessionRepo.addParticipant).toHaveBeenCalledTimes(2);
      expect(mockRedis.set).toHaveBeenCalledTimes(2);
    });
  });

  describe('User Leaving Session', () => {
    it('should remove participant and clear presence', async () => {
      const user = UserFactory.createOperator();
      const session = SessionFactory.createActive();

      mockSessionRepo.getSessionBySessionId.mockResolvedValueOnce(session);
      mockSessionRepo.isParticipant.mockResolvedValueOnce(true);
      mockSessionRepo.removeParticipant.mockResolvedValueOnce(undefined);
      mockSessionRepo.getParticipantCount.mockResolvedValueOnce(0);

      mockRedis.del.mockResolvedValueOnce(1);
      mockRedis.zrem.mockResolvedValueOnce(1);
      mockRedis.publish.mockResolvedValueOnce(1 as any);

      // Leave session
      await sessionManager.removeParticipant(session.id, user.id);
      await presenceManager.removePresence(session.sessionId, user.id);

      expect(mockSessionRepo.removeParticipant).toHaveBeenCalledWith(
        session.id,
        user.id
      );
      expect(mockRedis.del).toHaveBeenCalled();
    });

    it('should handle last user leaving session', async () => {
      const user = UserFactory.createOperator();
      const session = SessionFactory.createActive();

      mockSessionRepo.getSessionBySessionId.mockResolvedValueOnce(session);
      mockSessionRepo.isParticipant.mockResolvedValueOnce(true);
      mockSessionRepo.removeParticipant.mockResolvedValueOnce(undefined);

      mockRedis.del.mockResolvedValueOnce(1);
      mockRedis.zrem.mockResolvedValueOnce(1);
      mockRedis.publish.mockResolvedValueOnce(1 as any);

      await sessionManager.removeParticipant(session.id, user.id);
      await presenceManager.removePresence(session.sessionId, user.id);

      // Verify participant was removed and presence was cleared
      expect(mockSessionRepo.removeParticipant).toHaveBeenCalledWith(session.id, user.id);
      expect(mockRedis.del).toHaveBeenCalled();
    });
  });

  describe('Presence Updates', () => {
    it('should track user status changes', async () => {
      const user = UserFactory.createOperator();
      const session = SessionFactory.createActive();

      mockRedis.set.mockResolvedValue('OK' as any);
      mockRedis.zadd.mockResolvedValue(1 as any);
      mockRedis.publish.mockResolvedValue(1 as any);

      // User goes from online to away
      await presenceManager.setPresence(session.sessionId, user.id, 'online');
      await sleep(100);
      await presenceManager.setPresence(session.sessionId, user.id, 'away');

      expect(mockRedis.set).toHaveBeenCalledTimes(2);
      expect(mockRedis.publish).toHaveBeenCalledTimes(2);
    });

    it('should handle cursor position updates', async () => {
      const user = UserFactory.createOperator();
      const session = SessionFactory.createActive();
      const cursor = { eventId: 'evt-123', position: 150 };

      mockRedis.set.mockResolvedValue('OK' as any);
      mockRedis.zadd.mockResolvedValue(1 as any);
      mockRedis.publish.mockResolvedValue(1 as any);

      await presenceManager.setPresence(
        session.sessionId,
        user.id,
        'online',
        cursor
      );

      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('evt-123'),
        expect.any(Number)
      );
    });
  });

  describe('Session Capacity', () => {
    it('should enforce maximum participant limit', async () => {
      const session = SessionFactory.createActive();
      mockSessionRepo.getSessionBySessionId.mockResolvedValue(session);
      mockSessionRepo.addParticipant.mockResolvedValueOnce({
        id: 'participant-id',
        sessionId: session.id,
        userId: 'new-user',
        role: 'viewer',
        joinedAt: new Date()
      });
      mockSessionRepo.getParticipantCount.mockResolvedValue(51); // Exceeds capacity
      mockSessionRepo.removeParticipant.mockResolvedValueOnce(undefined);

      await expect(
        sessionManager.addParticipant(session.id, 'new-user', 'viewer')
      ).rejects.toThrow('maximum participant limit');
    });

    it('should allow joining when under capacity', async () => {
      const user = UserFactory.createViewer();
      const session = SessionFactory.createActive();

      mockSessionRepo.getSessionBySessionId.mockResolvedValue(session);
      mockSessionRepo.getParticipantCount.mockResolvedValue(25); // Under capacity
      mockSessionRepo.addParticipant.mockResolvedValue({} as any);

      await sessionManager.addParticipant(session.id, user.id, 'viewer');

      expect(mockSessionRepo.addParticipant).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle Redis connection failure gracefully', async () => {
      const user = UserFactory.createOperator();
      const session = SessionFactory.createActive();

      mockRedis.isReady.mockReturnValue(false);

      // Should throw an error when Redis is not ready
      await expect(
        presenceManager.setPresence(session.sessionId, user.id, 'online')
      ).rejects.toThrow('Redis client is not ready');

      // Redis operations should not be called when not ready
      expect(mockRedis.set).not.toHaveBeenCalled();
    });

    it('should handle database error during session creation', async () => {
      mockSessionRepo.createSession.mockRejectedValueOnce(
        new Error('Database connection failed')
      );

      await expect(
        sessionManager.createSession('user-1', 'op_001', { target: 'paper_001', objective: 'Test' })
      ).rejects.toThrow();
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle simultaneous joins', async () => {
      const users = [
        UserFactory.createOperator(),
        UserFactory.createViewer(),
        UserFactory.createViewer(),
      ];
      const session = SessionFactory.createActive();

      mockSessionRepo.getSessionBySessionId.mockResolvedValue(session);
      mockSessionRepo.addParticipant.mockResolvedValue({} as any);
      mockSessionRepo.getParticipantCount.mockResolvedValue(3);

      mockRedis.set.mockResolvedValue('OK' as any);
      mockRedis.zadd.mockResolvedValue(1 as any);
      mockRedis.publish.mockResolvedValue(1 as any);

      // All users join simultaneously
      await Promise.all(
        users.map((user, i) =>
          sessionManager.addParticipant(
            session.id,
            user.id,
            i === 0 ? 'operator' : 'viewer'
          )
        )
      );

      await Promise.all(
        users.map((user) =>
          presenceManager.setPresence(session.sessionId, user.id, 'online')
        )
      );

      expect(mockSessionRepo.addParticipant).toHaveBeenCalledTimes(3);
      expect(mockRedis.set).toHaveBeenCalledTimes(3);
    });
  });
});