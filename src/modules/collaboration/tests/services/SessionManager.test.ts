/**
 * SessionManager Unit Tests
 * 
 * Comprehensive tests for session management operations
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { SessionManager } from '../../services/SessionManager.js';
import { SessionRepository } from '../../repositories/SessionRepository.js';
import { SessionFactory, UserFactory } from '../factories/index.js';
import { CollaborationError, CollaborationErrorCode } from '../../types/index.js';

describe('SessionManager', () => {
  let sessionManager: SessionManager;
  let mockRepo: jest.Mocked<SessionRepository>;

  beforeEach(() => {
    // Create mock repository
    mockRepo = {
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

    sessionManager = new SessionManager(mockRepo, 50);
  });

  describe('createSession', () => {
    it('should create a new session successfully', async () => {
      const user = UserFactory.createOperator();
      const metadata = { target: 'paper_001', objective: 'Review' };
      const session = SessionFactory.create({ ownerId: user.id });

      mockRepo.createSession.mockResolvedValueOnce(session);
      mockRepo.addParticipant.mockResolvedValueOnce({
        userId: user.id,
        role: 'operator',
        joinedAt: new Date(),
      } as any);

      const result = await sessionManager.createSession(
        user.id,
        'op_001',
        metadata
      );

      expect(result).toBeDefined();
      expect(mockRepo.createSession).toHaveBeenCalled();
      expect(mockRepo.addParticipant).toHaveBeenCalledWith(
        session.id,
        user.id,
        'operator'
      );
    });

    it('should handle database errors', async () => {
      mockRepo.createSession.mockRejectedValueOnce(new Error('DB error'));

      await expect(
        sessionManager.createSession('user-id', 'op_001', {})
      ).rejects.toThrow(CollaborationError);
    });
  });

  describe('getSession', () => {
    it('should retrieve session by session ID', async () => {
      const session = SessionFactory.createActive();
      mockRepo.getSessionBySessionId.mockResolvedValueOnce(session);

      const result = await sessionManager.getSession(session.sessionId);

      expect(result).toEqual(session);
      expect(mockRepo.getSessionBySessionId).toHaveBeenCalledWith(session.sessionId);
    });

    it('should fallback to UUID lookup if session ID not found', async () => {
      const session = SessionFactory.createActive();
      mockRepo.getSessionBySessionId.mockResolvedValueOnce(null);
      mockRepo.getSessionById.mockResolvedValueOnce(session);

      const result = await sessionManager.getSession(session.id);

      expect(result).toEqual(session);
      expect(mockRepo.getSessionById).toHaveBeenCalled();
    });

    it('should return null for non-existent session', async () => {
      mockRepo.getSessionBySessionId.mockResolvedValueOnce(null);
      mockRepo.getSessionById.mockResolvedValueOnce(null);

      const result = await sessionManager.getSession('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('addParticipant', () => {
    it('should add participant to active session', async () => {
      const session = SessionFactory.createActive();
      const user = UserFactory.createAnalyst();
      const participant = {
        userId: user.id,
        role: 'commenter',
        joinedAt: new Date(),
      };

      mockRepo.getSessionBySessionId.mockResolvedValueOnce(session);
      mockRepo.getParticipantCount.mockResolvedValueOnce(5);
      mockRepo.addParticipant.mockResolvedValueOnce(participant as any);

      const result = await sessionManager.addParticipant(
        session.sessionId,
        user.id,
        'commenter'
      );

      expect(result).toEqual(participant);
    });

    it('should reject if session not found', async () => {
      mockRepo.getSessionBySessionId.mockResolvedValueOnce(null);
      mockRepo.getSessionById.mockResolvedValueOnce(null);

      await expect(
        sessionManager.addParticipant('invalid', 'user-id', 'viewer')
      ).rejects.toThrow('Session not found');
    });

    it('should reject if session is inactive', async () => {
      const session = SessionFactory.createCompleted();
      mockRepo.getSessionBySessionId.mockResolvedValueOnce(session);

      await expect(
        sessionManager.addParticipant(session.sessionId, 'user-id', 'viewer')
      ).rejects.toThrow('Cannot join inactive session');
    });

    it('should reject if session is full', async () => {
      const session = SessionFactory.createActive();
      mockRepo.getSessionBySessionId.mockResolvedValueOnce(session);
      mockRepo.getParticipantCount.mockResolvedValueOnce(50);

      await expect(
        sessionManager.addParticipant(session.sessionId, 'user-id', 'viewer')
      ).rejects.toThrow('maximum participant limit');
    });
  });

  describe('removeParticipant', () => {
    it('should remove participant from session', async () => {
      const session = SessionFactory.createActive();
      mockRepo.getSessionBySessionId.mockResolvedValueOnce(session);
      mockRepo.isParticipant.mockResolvedValueOnce(true);
      mockRepo.removeParticipant.mockResolvedValueOnce(undefined);

      await sessionManager.removeParticipant(session.sessionId, 'user-id');

      expect(mockRepo.removeParticipant).toHaveBeenCalledWith(
        session.id,
        'user-id'
      );
    });

    it('should reject if user is not a participant', async () => {
      const session = SessionFactory.createActive();
      mockRepo.getSessionBySessionId.mockResolvedValueOnce(session);
      mockRepo.isParticipant.mockResolvedValueOnce(false);

      await expect(
        sessionManager.removeParticipant(session.sessionId, 'user-id')
      ).rejects.toThrow('not a participant');
    });
  });

  describe('getParticipants', () => {
    it('should retrieve all participants', async () => {
      const session = SessionFactory.createActive();
      const participants = [
        { userId: 'user-1', role: 'operator', joinedAt: new Date() },
        { userId: 'user-2', role: 'commenter', joinedAt: new Date() },
      ];

      mockRepo.getSessionBySessionId.mockResolvedValueOnce(session);
      mockRepo.getActiveParticipants.mockResolvedValueOnce(participants as any);

      const result = await sessionManager.getParticipants(session.sessionId);

      expect(result).toEqual(participants);
    });
  });

  describe('endSession', () => {
    it('should end session and set status to completed', async () => {
      const session = SessionFactory.createActive();
      mockRepo.getSessionBySessionId.mockResolvedValueOnce(session);
      mockRepo.updateSession.mockResolvedValueOnce(undefined);

      await sessionManager.endSession(session.sessionId);

      expect(mockRepo.updateSession).toHaveBeenCalledWith(
        session.id,
        expect.objectContaining({ status: 'completed' })
      );
    });
  });

  describe('hasPermission', () => {
    it('should grant all permissions to owner', async () => {
      const session = SessionFactory.create({ ownerId: 'owner-id' });
      mockRepo.getSessionBySessionId.mockResolvedValueOnce(session);

      const result = await sessionManager.hasPermission(
        session.sessionId,
        'owner-id',
        'manage'
      );

      expect(result).toBe(true);
    });

    it('should check role-based permissions for participants', async () => {
      const session = SessionFactory.create({ ownerId: 'owner-id' });
      const participants = [
        { userId: 'user-1', role: 'operator', joinedAt: new Date() },
      ];

      mockRepo.getSessionBySessionId.mockResolvedValueOnce(session);
      mockRepo.getActiveParticipants.mockResolvedValueOnce(participants as any);

      const canOperate = await sessionManager.hasPermission(
        session.sessionId,
        'user-1',
        'operate'
      );

      expect(canOperate).toBe(true);
    });

    it('should deny manage permission to non-owners', async () => {
      const session = SessionFactory.create({ ownerId: 'owner-id' });
      const participants = [
        { userId: 'user-1', role: 'operator', joinedAt: new Date() },
      ];

      mockRepo.getSessionBySessionId.mockResolvedValueOnce(session);
      mockRepo.getActiveParticipants.mockResolvedValueOnce(participants as any);

      const canManage = await sessionManager.hasPermission(
        session.sessionId,
        'user-1',
        'manage'
      );

      expect(canManage).toBe(false);
    });
  });

  describe('getActiveSessions', () => {
    it('should retrieve all active sessions', async () => {
      const sessions = SessionFactory.createMany(3, { status: 'active' });
      mockRepo.getActiveSessions.mockResolvedValueOnce(sessions);

      const result = await sessionManager.getActiveSessions();

      expect(result).toHaveLength(3);
      expect(mockRepo.getActiveSessions).toHaveBeenCalled();
    });
  });

  describe('cleanupOldSessions', () => {
    it('should cleanup old sessions', async () => {
      mockRepo.cleanupOldSessions.mockResolvedValueOnce(5);

      const result = await sessionManager.cleanupOldSessions(30);

      expect(result).toBe(5);
      expect(mockRepo.cleanupOldSessions).toHaveBeenCalledWith(30);
    });
  });
});