/**
 * Session Repository
 * 
 * Database repository layer for collaboration sessions and participants.
 * Handles all database queries related to session management with
 * transaction support and prepared statements for performance.
 */

import {
  CollaborationSession,
  SessionParticipant,
  UserRole,
  SessionStatus,
  CollaborationError,
  CollaborationErrorCode
} from '../types';

/**
 * Database client interface (abstract to support different DB libraries)
 */
export interface DatabaseClient {
  query(sql: string, params?: any[]): Promise<any>;
  transaction<T>(callback: (client: DatabaseClient) => Promise<T>): Promise<T>;
}

/**
 * Session creation parameters
 */
export interface CreateSessionParams {
  operationId: string;
  sessionId: string;
  ownerId: string;
  target?: string;
  objective?: string;
  metadata?: Record<string, any>;
}

/**
 * Session update parameters
 */
export interface UpdateSessionParams {
  status?: SessionStatus;
  target?: string;
  objective?: string;
  endTime?: Date;
  metadata?: Record<string, any>;
}

/**
 * SessionRepository - Database operations for collaboration sessions
 */
export class SessionRepository {
  constructor(private db: DatabaseClient) {}

  /**
   * Create a new collaboration session
   */
  async createSession(params: CreateSessionParams): Promise<CollaborationSession> {
    try {
      const sql = `
        INSERT INTO collaboration_sessions (
          operation_id, session_id, owner_id, status, target, objective, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `;

      const result = await this.db.query(sql, [
        params.operationId,
        params.sessionId,
        params.ownerId,
        'active',
        params.target || null,
        params.objective || null,
        JSON.stringify(params.metadata || {})
      ]);

      return this.mapRowToSession(result.rows[0]);
    } catch (error) {
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        `Failed to create session: ${(error as Error).message}`,
        { params }
      );
    }
  }

  /**
   * Get session by ID (UUID)
   */
  async getSessionById(id: string): Promise<CollaborationSession | null> {
    try {
      const sql = `
        SELECT * FROM collaboration_sessions
        WHERE id = $1
      `;

      const result = await this.db.query(sql, [id]);
      
      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToSession(result.rows[0]);
    } catch (error) {
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        `Failed to get session by ID: ${(error as Error).message}`,
        { id }
      );
    }
  }

  /**
   * Get session by session ID (string identifier)
   */
  async getSessionBySessionId(sessionId: string): Promise<CollaborationSession | null> {
    try {
      const sql = `
        SELECT * FROM collaboration_sessions
        WHERE session_id = $1
      `;

      const result = await this.db.query(sql, [sessionId]);
      
      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToSession(result.rows[0]);
    } catch (error) {
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        `Failed to get session by session ID: ${(error as Error).message}`,
        { sessionId }
      );
    }
  }

  /**
   * Update session
   */
  async updateSession(id: string, params: UpdateSessionParams): Promise<CollaborationSession> {
    try {
      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (params.status !== undefined) {
        updates.push(`status = $${paramIndex++}`);
        values.push(params.status);
      }

      if (params.target !== undefined) {
        updates.push(`target = $${paramIndex++}`);
        values.push(params.target);
      }

      if (params.objective !== undefined) {
        updates.push(`objective = $${paramIndex++}`);
        values.push(params.objective);
      }

      if (params.endTime !== undefined) {
        updates.push(`end_time = $${paramIndex++}`);
        values.push(params.endTime);
      }

      if (params.metadata !== undefined) {
        updates.push(`metadata = $${paramIndex++}`);
        values.push(JSON.stringify(params.metadata));
      }

      if (updates.length === 0) {
        throw new Error('No update parameters provided');
      }

      values.push(id);

      const sql = `
        UPDATE collaboration_sessions
        SET ${updates.join(', ')}, updated_at = NOW()
        WHERE id = $${paramIndex}
        RETURNING *
      `;

      const result = await this.db.query(sql, values);

      if (result.rows.length === 0) {
        throw new Error('Session not found');
      }

      return this.mapRowToSession(result.rows[0]);
    } catch (error) {
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        `Failed to update session: ${(error as Error).message}`,
        { id, params }
      );
    }
  }

  /**
   * Delete session (soft delete by setting status to completed)
   */
  async deleteSession(id: string): Promise<void> {
    try {
      await this.updateSession(id, {
        status: 'completed',
        endTime: new Date()
      });
    } catch (error) {
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        `Failed to delete session: ${(error as Error).message}`,
        { id }
      );
    }
  }

  /**
   * Get all active sessions
   */
  async getActiveSessions(): Promise<CollaborationSession[]> {
    try {
      const sql = `
        SELECT * FROM collaboration_sessions
        WHERE status = 'active'
        ORDER BY start_time DESC
      `;

      const result = await this.db.query(sql);
      return result.rows.map((row: any) => this.mapRowToSession(row));
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
  async getSessionsByOwner(ownerId: string, limit: number = 50): Promise<CollaborationSession[]> {
    try {
      const sql = `
        SELECT * FROM collaboration_sessions
        WHERE owner_id = $1
        ORDER BY start_time DESC
        LIMIT $2
      `;

      const result = await this.db.query(sql, [ownerId, limit]);
      return result.rows.map((row: any) => this.mapRowToSession(row));
    } catch (error) {
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        `Failed to get sessions by owner: ${(error as Error).message}`,
        { ownerId }
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
      const sql = `
        INSERT INTO session_participants (session_id, user_id, role)
        VALUES ($1, $2, $3)
        ON CONFLICT (session_id, user_id) DO UPDATE
        SET left_at = NULL, role = EXCLUDED.role
        RETURNING *
      `;

      const result = await this.db.query(sql, [sessionId, userId, role]);
      return this.mapRowToParticipant(result.rows[0]);
    } catch (error) {
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        `Failed to add participant: ${(error as Error).message}`,
        { sessionId, userId, role }
      );
    }
  }

  /**
   * Remove participant from session (mark as left)
   */
  async removeParticipant(sessionId: string, userId: string): Promise<void> {
    try {
      const sql = `
        UPDATE session_participants
        SET left_at = NOW()
        WHERE session_id = $1 AND user_id = $2 AND left_at IS NULL
      `;

      await this.db.query(sql, [sessionId, userId]);
    } catch (error) {
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        `Failed to remove participant: ${(error as Error).message}`,
        { sessionId, userId }
      );
    }
  }

  /**
   * Get active participants in a session
   */
  async getActiveParticipants(sessionId: string): Promise<SessionParticipant[]> {
    try {
      const sql = `
        SELECT * FROM session_participants
        WHERE session_id = $1 AND left_at IS NULL
        ORDER BY joined_at ASC
      `;

      const result = await this.db.query(sql, [sessionId]);
      return result.rows.map((row: any) => this.mapRowToParticipant(row));
    } catch (error) {
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        `Failed to get active participants: ${(error as Error).message}`,
        { sessionId }
      );
    }
  }

  /**
   * Get all participants (including those who left) in a session
   */
  async getAllParticipants(sessionId: string): Promise<SessionParticipant[]> {
    try {
      const sql = `
        SELECT * FROM session_participants
        WHERE session_id = $1
        ORDER BY joined_at ASC
      `;

      const result = await this.db.query(sql, [sessionId]);
      return result.rows.map((row: any) => this.mapRowToParticipant(row));
    } catch (error) {
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        `Failed to get all participants: ${(error as Error).message}`,
        { sessionId }
      );
    }
  }

  /**
   * Check if user is participant in session
   */
  async isParticipant(sessionId: string, userId: string): Promise<boolean> {
    try {
      const sql = `
        SELECT 1 FROM session_participants
        WHERE session_id = $1 AND user_id = $2 AND left_at IS NULL
        LIMIT 1
      `;

      const result = await this.db.query(sql, [sessionId, userId]);
      return result.rows.length > 0;
    } catch (error) {
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        `Failed to check participant: ${(error as Error).message}`,
        { sessionId, userId }
      );
    }
  }

  /**
   * Get participant count for session
   */
  async getParticipantCount(sessionId: string): Promise<number> {
    try {
      const sql = `
        SELECT COUNT(*) as count FROM session_participants
        WHERE session_id = $1 AND left_at IS NULL
      `;

      const result = await this.db.query(sql, [sessionId]);
      return parseInt(result.rows[0].count, 10);
    } catch (error) {
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        `Failed to get participant count: ${(error as Error).message}`,
        { sessionId }
      );
    }
  }

  /**
   * Cleanup old inactive sessions
   */
  async cleanupOldSessions(daysOld: number = 30): Promise<number> {
    try {
      const sql = `
        UPDATE collaboration_sessions
        SET status = 'completed', end_time = NOW()
        WHERE status = 'active'
        AND start_time < NOW() - INTERVAL '${daysOld} days'
        RETURNING id
      `;

      const result = await this.db.query(sql);
      return result.rows.length;
    } catch (error) {
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        `Failed to cleanup old sessions: ${(error as Error).message}`,
        { daysOld }
      );
    }
  }

  /**
   * Map database row to CollaborationSession
   */
  private mapRowToSession(row: any): CollaborationSession {
    return {
      id: row.id,
      operationId: row.operation_id,
      sessionId: row.session_id,
      ownerId: row.owner_id,
      status: row.status,
      target: row.target,
      objective: row.objective,
      startTime: new Date(row.start_time),
      endTime: row.end_time ? new Date(row.end_time) : undefined,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }

  /**
   * Map database row to SessionParticipant
   */
  private mapRowToParticipant(row: any): SessionParticipant {
    return {
      id: row.id,
      sessionId: row.session_id,
      userId: row.user_id,
      role: row.role,
      joinedAt: new Date(row.joined_at),
      leftAt: row.left_at ? new Date(row.left_at) : undefined
    };
  }
}

/**
 * Create a session repository instance
 */
export function createSessionRepository(db: DatabaseClient): SessionRepository {
  return new SessionRepository(db);
}