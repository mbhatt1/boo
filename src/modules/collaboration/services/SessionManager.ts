/**
 * Session Manager Service
 * 
 * High-level service for managing collaboration sessions. Handles session
 * lifecycle, participant management, permissions, and integrates with the
 * database layer.
 * 
 * Features:
 * - Session creation, joining, and leaving
 * - Participant management with role-based access
 * - Session lifecycle management (creation, closing, archiving)
 * - Permission checks and access control
 * - Session queries and participant lists
 */

import {
  ISessionManager,
  CollaborationSession,
  SessionParticipant,
  UserRole,
  SessionStatus,
  SessionMetadata,
  CollaborationError,
  CollaborationErrorCode
} from '../types';
import { SessionRepository } from '../repositories/SessionRepository';

/**
 * Session creation options
 */
export interface CreateSessionOptions {
  operationId: string;
  ownerId: string;
  target?: string;
  objective?: string;
  metadata?: SessionMetadata;
  autoJoinOwner?: boolean;
}

/**
 * SessionManager - Manages collaboration sessions
 */
export class SessionManager implements ISessionManager {
  constructor(
    private sessionRepo: SessionRepository,
    private maxParticipants: number = 50
  ) {}

  /**
   * Create a new collaboration session
   */
  async createSession(
    ownerId: string,
    operationId: string,
    metadata: SessionMetadata
  ): Promise<CollaborationSession> {
    try {
      // Generate unique session ID
      const sessionId = this.generateSessionId();

      // Create session in database
      const session = await this.sessionRepo.createSession({
        operationId,
        sessionId,
        ownerId,
        target: metadata.target,
        objective: metadata.objective,
        metadata
      });

      // Automatically add owner as operator participant
      await this.sessionRepo.addParticipant(session.id, ownerId, 'operator');

      console.log(`[SessionManager] Created session ${sessionId} for operation ${operationId}`);

      return session;
    } catch (error) {
      if (error instanceof CollaborationError) {
        throw error;
      }
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        `Failed to create session: ${(error as Error).message}`,
        { ownerId, operationId }
      );
    }
  }

  /**
   * Get session by ID
   */
  async getSession(sessionId: string): Promise<CollaborationSession | null> {
    try {
      // Try to get by session ID string first
      let session = await this.sessionRepo.getSessionBySessionId(sessionId);
      
      // If not found, try UUID lookup
      if (!session) {
        session = await this.sessionRepo.getSessionById(sessionId);
      }

      return session;
    } catch (error) {
      if (error instanceof CollaborationError) {
        throw error;
      }
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        `Failed to get session: ${(error as Error).message}`,
        { sessionId }
      );
    }
  }

  /**
   * Add participant to session
   */
  async addParticipant(
    sessionId: string,
    userId: string,
    role: UserRole
  ): Promise<SessionParticipant> {
    try {
      // Get session to validate it exists
      const session = await this.getSession(sessionId);
      if (!session) {
        throw new CollaborationError(
          CollaborationErrorCode.SESSION_NOT_FOUND,
          'Session not found',
          { sessionId }
        );
      }

      // Check if session is active
      if (session.status !== 'active') {
        throw new CollaborationError(
          CollaborationErrorCode.PERMISSION_DENIED,
          'Cannot join inactive session',
          { sessionId, status: session.status }
        );
      }

      // Check participant limit and add participant atomically to prevent race condition
      // This should ideally be done in a database transaction
      try {
        // Add participant with constraint check - will fail if limit exceeded
        const participant = await this.sessionRepo.addParticipant(session.id, userId, role);
        
        // After adding, verify we haven't exceeded limit (defense in depth)
        const participantCount = await this.sessionRepo.getParticipantCount(session.id);
        if (participantCount > this.maxParticipants) {
          // Rollback by removing the participant
          await this.sessionRepo.removeParticipant(session.id, userId);
          throw new CollaborationError(
            CollaborationErrorCode.SESSION_FULL,
            'Session has reached maximum participant limit',
            { sessionId, maxParticipants: this.maxParticipants }
          );
        }

        console.log(`[SessionManager] User ${userId} joined session ${sessionId} as ${role}`);
        return participant;
      } catch (error) {
        // If it's a unique constraint violation, it means user already in session
        if (error instanceof Error && error.message.includes('unique')) {
          throw new CollaborationError(
            CollaborationErrorCode.PERMISSION_DENIED,
            'User is already a participant in this session',
            { sessionId, userId }
          );
        }
        throw error;
      }
    } catch (error) {
      if (error instanceof CollaborationError) {
        throw error;
      }
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        `Failed to add participant: ${(error as Error).message}`,
        { sessionId, userId, role }
      );
    }
  }

  /**
   * Remove participant from session
   */
  async removeParticipant(sessionId: string, userId: string): Promise<void> {
    try {
      // Get session to validate it exists
      const session = await this.getSession(sessionId);
      if (!session) {
        throw new CollaborationError(
          CollaborationErrorCode.SESSION_NOT_FOUND,
          'Session not found',
          { sessionId }
        );
      }

      // Check if user is a participant
      const isParticipant = await this.sessionRepo.isParticipant(session.id, userId);
      if (!isParticipant) {
        throw new CollaborationError(
          CollaborationErrorCode.PERMISSION_DENIED,
          'User is not a participant in this session',
          { sessionId, userId }
        );
      }

      await this.sessionRepo.removeParticipant(session.id, userId);

      console.log(`[SessionManager] User ${userId} left session ${sessionId}`);
    } catch (error) {
      if (error instanceof CollaborationError) {
        throw error;
      }
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        `Failed to remove participant: ${(error as Error).message}`,
        { sessionId, userId }
      );
    }
  }

  /**
   * Get all participants in a session
   */
  async getParticipants(sessionId: string): Promise<SessionParticipant[]> {
    try {
      const session = await this.getSession(sessionId);
      if (!session) {
        throw new CollaborationError(
          CollaborationErrorCode.SESSION_NOT_FOUND,
          'Session not found',
          { sessionId }
        );
      }

      return await this.sessionRepo.getActiveParticipants(session.id);
    } catch (error) {
      if (error instanceof CollaborationError) {
        throw error;
      }
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        `Failed to get participants: ${(error as Error).message}`,
        { sessionId }
      );
    }
  }

  /**
   * Update session status
   */
  async updateSessionStatus(sessionId: string, status: SessionStatus): Promise<void> {
    try {
      const session = await this.getSession(sessionId);
      if (!session) {
        throw new CollaborationError(
          CollaborationErrorCode.SESSION_NOT_FOUND,
          'Session not found',
          { sessionId }
        );
      }

      const updates: any = { status };
      
      // Set end time if completing or failing
      if (status === 'completed' || status === 'failed') {
        updates.endTime = new Date();
      }

      await this.sessionRepo.updateSession(session.id, updates);

      console.log(`[SessionManager] Updated session ${sessionId} status to ${status}`);
    } catch (error) {
      if (error instanceof CollaborationError) {
        throw error;
      }
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        `Failed to update session status: ${(error as Error).message}`,
        { sessionId, status }
      );
    }
  }

  /**
   * End a session
   */
  async endSession(sessionId: string): Promise<void> {
    await this.updateSessionStatus(sessionId, 'completed');
  }

  /**
   * Get all active sessions
   */
  async getActiveSessions(): Promise<CollaborationSession[]> {
    try {
      return await this.sessionRepo.getActiveSessions();
    } catch (error) {
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        `Failed to get active sessions: ${(error as Error).message}`
      );
    }
  }

  /**
   * Get sessions by owner
   */
  async getSessionsByOwner(ownerId: string, limit?: number): Promise<CollaborationSession[]> {
    try {
      return await this.sessionRepo.getSessionsByOwner(ownerId, limit);
    } catch (error) {
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        `Failed to get sessions by owner: ${(error as Error).message}`,
        { ownerId }
      );
    }
  }

  /**
   * Check if user has permission for a session action
   */
  async hasPermission(
    sessionId: string,
    userId: string,
    action: 'view' | 'comment' | 'operate' | 'manage'
  ): Promise<boolean> {
    try {
      const session = await this.getSession(sessionId);
      if (!session) {
        return false;
      }

      // Owner always has full permissions
      if (session.ownerId === userId) {
        return true;
      }

      // Get participant role
      const participants = await this.sessionRepo.getActiveParticipants(session.id);
      const participant = participants.find(p => p.userId === userId);

      if (!participant) {
        // Check session visibility/privacy settings before allowing view
        const isPublic = session.metadata?.isPublic ?? false;
        return action === 'view' && isPublic; // Non-participants can only view public sessions
      }

      // Check role-based permissions
      switch (action) {
        case 'view':
          return true; // All participants can view
        case 'comment':
          return participant.role === 'commenter' || participant.role === 'operator';
        case 'operate':
          return participant.role === 'operator';
        case 'manage':
          return session.ownerId === userId;
        default:
          return false;
      }
    } catch (error) {
      console.error('[SessionManager] Permission check failed:', error);
      return false;
    }
  }

  /**
   * Check if user is the session owner
   */
  async isOwner(sessionId: string, userId: string): Promise<boolean> {
    try {
      const session = await this.getSession(sessionId);
      return session?.ownerId === userId;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if user is a participant
   */
  async isParticipant(sessionId: string, userId: string): Promise<boolean> {
    try {
      const session = await this.getSession(sessionId);
      if (!session) {
        return false;
      }

      return await this.sessionRepo.isParticipant(session.id, userId);
    } catch (error) {
      return false;
    }
  }

  /**
   * Get participant count
   */
  async getParticipantCount(sessionId: string): Promise<number> {
    try {
      const session = await this.getSession(sessionId);
      if (!session) {
        return 0;
      }

      return await this.sessionRepo.getParticipantCount(session.id);
    } catch (error) {
      return 0;
    }
  }

  /**
   * Update session metadata
   */
  async updateMetadata(
    sessionId: string,
    metadata: Partial<SessionMetadata>
  ): Promise<void> {
    try {
      const session = await this.getSession(sessionId);
      if (!session) {
        throw new CollaborationError(
          CollaborationErrorCode.SESSION_NOT_FOUND,
          'Session not found',
          { sessionId }
        );
      }

      // Merge with existing metadata
      const updatedMetadata = {
        ...session.metadata,
        ...metadata
      };

      await this.sessionRepo.updateSession(session.id, { metadata: updatedMetadata });

      console.log(`[SessionManager] Updated metadata for session ${sessionId}`);
    } catch (error) {
      if (error instanceof CollaborationError) {
        throw error;
      }
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        `Failed to update session metadata: ${(error as Error).message}`,
        { sessionId }
      );
    }
  }

  /**
   * Cleanup old inactive sessions
   */
  async cleanupOldSessions(daysOld: number = 30): Promise<number> {
    try {
      return await this.sessionRepo.cleanupOldSessions(daysOld);
    } catch (error) {
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        `Failed to cleanup old sessions: ${(error as Error).message}`,
        { daysOld }
      );
    }
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    // Format: SESSION-YYYYMMDD-XXXX
    const date = new Date();
    const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `SESSION-${dateStr}-${random}`;
  }
}

/**
 * Create a SessionManager instance
 */
export function createSessionManager(
  sessionRepo: SessionRepository,
  maxParticipants?: number
): SessionManager {
  return new SessionManager(sessionRepo, maxParticipants);
}

// Removed mock UUID function - use crypto.randomUUID() or uuid library instead