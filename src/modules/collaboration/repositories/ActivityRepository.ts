/**
 * Activity Repository
 * 
 * Database repository layer for activity logging. Handles all database
 * queries related to activity logs with bulk insert optimization and
 * efficient querying with filters.
 */

import {
  ActivityLog,
  ActivityType,
  CollaborationError,
  CollaborationErrorCode
} from '../types';
import { DatabaseClient } from './SessionRepository';

/**
 * Activity creation parameters
 */
export interface CreateActivityParams {
  sessionId: string;
  userId: string | null;
  activityType: string;
  details: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Activity query filters
 */
export interface ActivityQueryFilters {
  sessionId?: string;
  userId?: string;
  activityType?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

/**
 * Activity summary for a session
 */
export interface ActivitySummary {
  sessionId: string;
  totalActivities: number;
  activityTypes: Record<string, number>;
  uniqueUsers: number;
  firstActivity: Date;
  lastActivity: Date;
}

/**
 * ActivityRepository - Database operations for activity logging
 */
export class ActivityRepository {
  private bulkInsertQueue: CreateActivityParams[] = [];
  private bulkInsertTimer?: ReturnType<typeof setTimeout>;
  private readonly BULK_INSERT_DELAY = 1000; // 1 second
  private readonly BULK_INSERT_SIZE = 100; // Max items per bulk insert

  constructor(private db: DatabaseClient) {}

  /**
   * Log a single activity (immediate insert)
   */
  async logActivity(params: CreateActivityParams): Promise<ActivityLog> {
    try {
      const sql = `
        INSERT INTO activity_log (
          session_id, user_id, activity_type, details, ip_address, user_agent
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `;

      const result = await this.db.query(sql, [
        params.sessionId,
        params.userId,
        params.activityType,
        JSON.stringify(params.details),
        params.ipAddress || null,
        params.userAgent || null
      ]);

      return this.mapRowToActivity(result.rows[0]);
    } catch (error) {
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        `Failed to log activity: ${(error as Error).message}`,
        { params }
      );
    }
  }

  /**
   * Queue activity for bulk insert (optimized for high throughput)
   */
  queueActivity(params: CreateActivityParams): void {
    this.bulkInsertQueue.push(params);

    // Flush immediately if queue is full
    if (this.bulkInsertQueue.length >= this.BULK_INSERT_SIZE) {
      this.flushBulkInsert();
    } else {
      // Schedule flush if not already scheduled
      if (!this.bulkInsertTimer) {
        this.bulkInsertTimer = setTimeout(() => {
          this.flushBulkInsert();
        }, this.BULK_INSERT_DELAY);
      }
    }
  }

  /**
   * Flush bulk insert queue
   */
  private async flushBulkInsert(): Promise<void> {
    if (this.bulkInsertQueue.length === 0) {
      return;
    }

    if (this.bulkInsertTimer) {
      clearTimeout(this.bulkInsertTimer);
      this.bulkInsertTimer = undefined;
    }

    const activities = [...this.bulkInsertQueue];
    this.bulkInsertQueue = [];

    try {
      await this.bulkInsertActivities(activities);
    } catch (error) {
      console.error('[ActivityRepository] Bulk insert failed:', error);
      // Re-queue failed activities
      this.bulkInsertQueue.unshift(...activities);
    }
  }

  /**
   * Bulk insert multiple activities
   */
  private async bulkInsertActivities(activities: CreateActivityParams[]): Promise<void> {
    if (activities.length === 0) {
      return;
    }

    try {
      // Build bulk insert query
      const values: any[] = [];
      const placeholders: string[] = [];
      let paramIndex = 1;

      for (const activity of activities) {
        placeholders.push(
          `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5})`
        );
        values.push(
          activity.sessionId,
          activity.userId,
          activity.activityType,
          JSON.stringify(activity.details),
          activity.ipAddress || null,
          activity.userAgent || null
        );
        paramIndex += 6;
      }

      const sql = `
        INSERT INTO activity_log (
          session_id, user_id, activity_type, details, ip_address, user_agent
        ) VALUES ${placeholders.join(', ')}
      `;

      await this.db.query(sql, values);
      
      console.log(`[ActivityRepository] Bulk inserted ${activities.length} activities`);
    } catch (error) {
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        `Failed to bulk insert activities: ${(error as Error).message}`,
        { count: activities.length }
      );
    }
  }

  /**
   * Get activity by ID
   */
  async getActivityById(id: string): Promise<ActivityLog | null> {
    try {
      const sql = `
        SELECT * FROM activity_log
        WHERE id = $1
      `;

      const result = await this.db.query(sql, [id]);
      
      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToActivity(result.rows[0]);
    } catch (error) {
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        `Failed to get activity by ID: ${(error as Error).message}`,
        { id }
      );
    }
  }

  /**
   * Get activities with filters
   */
  async getActivities(filters: ActivityQueryFilters = {}): Promise<ActivityLog[]> {
    try {
      const conditions: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (filters.sessionId) {
        conditions.push(`session_id = $${paramIndex++}`);
        values.push(filters.sessionId);
      }

      if (filters.userId) {
        conditions.push(`user_id = $${paramIndex++}`);
        values.push(filters.userId);
      }

      if (filters.activityType) {
        conditions.push(`activity_type = $${paramIndex++}`);
        values.push(filters.activityType);
      }

      if (filters.startDate) {
        conditions.push(`created_at >= $${paramIndex++}`);
        values.push(filters.startDate);
      }

      if (filters.endDate) {
        conditions.push(`created_at <= $${paramIndex++}`);
        values.push(filters.endDate);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const limit = filters.limit || 100;
      const offset = filters.offset || 0;

      const sql = `
        SELECT * FROM activity_log
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${paramIndex++}
        OFFSET $${paramIndex}
      `;

      values.push(limit, offset);

      const result = await this.db.query(sql, values);
      return result.rows.map((row: any) => this.mapRowToActivity(row));
    } catch (error) {
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        `Failed to get activities: ${(error as Error).message}`,
        { filters }
      );
    }
  }

  /**
   * Get session activity log
   */
  async getSessionActivity(sessionId: string, limit: number = 100): Promise<ActivityLog[]> {
    return this.getActivities({ sessionId, limit });
  }

  /**
   * Get user activity log
   */
  async getUserActivity(userId: string, limit: number = 100): Promise<ActivityLog[]> {
    return this.getActivities({ userId, limit });
  }

  /**
   * Get activity summary for a session
   */
  async getSessionSummary(sessionId: string): Promise<ActivitySummary | null> {
    try {
      const sql = `
        SELECT 
          session_id,
          COUNT(*) as total_activities,
          COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) as unique_users,
          MIN(created_at) as first_activity,
          MAX(created_at) as last_activity,
          jsonb_object_agg(activity_type, type_count) as activity_types
        FROM (
          SELECT 
            session_id,
            user_id,
            created_at,
            activity_type,
            COUNT(*) as type_count
          FROM activity_log
          WHERE session_id = $1
          GROUP BY session_id, user_id, created_at, activity_type
        ) sub
        GROUP BY session_id
      `;

      const result = await this.db.query(sql, [sessionId]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        sessionId: row.session_id,
        totalActivities: parseInt(row.total_activities, 10),
        activityTypes: typeof row.activity_types === 'string' 
          ? JSON.parse(row.activity_types) 
          : row.activity_types,
        uniqueUsers: parseInt(row.unique_users, 10),
        firstActivity: new Date(row.first_activity),
        lastActivity: new Date(row.last_activity)
      };
    } catch (error) {
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        `Failed to get session summary: ${(error as Error).message}`,
        { sessionId }
      );
    }
  }

  /**
   * Get recent activities across all sessions
   */
  async getRecentActivities(limit: number = 50): Promise<ActivityLog[]> {
    try {
      const sql = `
        SELECT * FROM activity_log
        ORDER BY created_at DESC
        LIMIT $1
      `;

      const result = await this.db.query(sql, [limit]);
      return result.rows.map((row: any) => this.mapRowToActivity(row));
    } catch (error) {
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        `Failed to get recent activities: ${(error as Error).message}`,
        { limit }
      );
    }
  }

  /**
   * Get activity count by type for a session
   */
  async getActivityCountByType(sessionId: string): Promise<Record<string, number>> {
    try {
      const sql = `
        SELECT activity_type, COUNT(*) as count
        FROM activity_log
        WHERE session_id = $1
        GROUP BY activity_type
      `;

      const result = await this.db.query(sql, [sessionId]);
      
      const counts: Record<string, number> = {};
      for (const row of result.rows) {
        counts[row.activity_type] = parseInt(row.count, 10);
      }
      
      return counts;
    } catch (error) {
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        `Failed to get activity count by type: ${(error as Error).message}`,
        { sessionId }
      );
    }
  }

  /**
   * Delete old activities (for cleanup)
   */
  async deleteOldActivities(daysOld: number = 90): Promise<number> {
    try {
      const sql = `
        DELETE FROM activity_log
        WHERE created_at < NOW() - INTERVAL '${daysOld} days'
        RETURNING id
      `;

      const result = await this.db.query(sql);
      return result.rows.length;
    } catch (error) {
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        `Failed to delete old activities: ${(error as Error).message}`,
        { daysOld }
      );
    }
  }

  /**
   * Get activity timeline for a session (grouped by hour)
   */
  async getActivityTimeline(sessionId: string): Promise<Array<{ hour: Date; count: number }>> {
    try {
      const sql = `
        SELECT 
          date_trunc('hour', created_at) as hour,
          COUNT(*) as count
        FROM activity_log
        WHERE session_id = $1
        GROUP BY hour
        ORDER BY hour ASC
      `;

      const result = await this.db.query(sql, [sessionId]);
      
      return result.rows.map((row: any) => ({
        hour: new Date(row.hour),
        count: parseInt(row.count, 10)
      }));
    } catch (error) {
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        `Failed to get activity timeline: ${(error as Error).message}`,
        { sessionId }
      );
    }
  }

  /**
   * Ensure all queued activities are flushed (call on shutdown)
   */
  async shutdown(): Promise<void> {
    await this.flushBulkInsert();
  }

  /**
   * Map database row to ActivityLog
   */
  private mapRowToActivity(row: any): ActivityLog {
    return {
      id: row.id,
      sessionId: row.session_id,
      userId: row.user_id,
      activityType: row.activity_type,
      details: typeof row.details === 'string' ? JSON.parse(row.details) : row.details,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      createdAt: new Date(row.created_at)
    };
  }
}

/**
 * Create an activity repository instance
 */
export function createActivityRepository(db: DatabaseClient): ActivityRepository {
  return new ActivityRepository(db);
}