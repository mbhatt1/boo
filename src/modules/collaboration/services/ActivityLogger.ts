/**
 * Activity Logger Service
 * 
 * High-level service for logging collaboration activities. Wraps the
 * ActivityRepository with additional features like queuing, filtering,
 * and summary generation.
 * 
 * Features:
 * - Async activity logging with queuing
 * - Session activity summaries
 * - User activity timelines
 * - Activity filtering and queries
 * - Audit trail generation
 * - Bulk insert optimization
 */

import {
  IActivityLogger,
  ActivityLog,
  ActivityType,
  CollaborationError,
  CollaborationErrorCode
} from '../types';
import {
  ActivityRepository,
  CreateActivityParams,
  ActivityQueryFilters,
  ActivitySummary
} from '../repositories/ActivityRepository';

/**
 * Activity logging options
 */
export interface LogActivityOptions {
  sessionId: string;
  userId: string | null;
  activityType: ActivityType | string;
  details: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  immediate?: boolean; // If true, bypass queue and log immediately
}

/**
 * Audit trail entry
 */
export interface AuditTrailEntry {
  timestamp: Date;
  sessionId: string;
  userId: string | null;
  username?: string;
  activityType: string;
  description: string;
  details: Record<string, any>;
}

/**
 * ActivityLogger - High-level service for activity logging
 */
export class ActivityLogger implements IActivityLogger {
  constructor(
    private activityRepo: ActivityRepository,
    private getUserName?: (userId: string) => Promise<string>
  ) {}

  /**
   * Log an activity event
   */
  async logActivity(
    sessionId: string,
    userId: string | null,
    activityType: ActivityType,
    details: Record<string, any>,
    ipAddress?: string,
    userAgent?: string
  ): Promise<ActivityLog> {
    try {
      const params: CreateActivityParams = {
        sessionId,
        userId,
        activityType,
        details,
        ipAddress,
        userAgent
      };

      const activity = await this.activityRepo.logActivity(params);
      
      console.log(`[ActivityLogger] Logged activity: ${activityType} for session ${sessionId}`);
      
      return activity;
    } catch (error) {
      if (error instanceof CollaborationError) {
        throw error;
      }
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        `Failed to log activity: ${(error as Error).message}`,
        { sessionId, activityType }
      );
    }
  }

  /**
   * Queue activity for bulk insert (non-blocking)
   */
  queueActivity(options: LogActivityOptions): void {
    try {
      const params: CreateActivityParams = {
        sessionId: options.sessionId,
        userId: options.userId,
        activityType: options.activityType,
        details: options.details,
        ipAddress: options.ipAddress,
        userAgent: options.userAgent
      };

      if (options.immediate) {
        // Log immediately without queuing
        this.activityRepo.logActivity(params).catch(error => {
          console.error('[ActivityLogger] Failed to log immediate activity:', error);
        });
      } else {
        // Queue for bulk insert
        this.activityRepo.queueActivity(params);
      }
    } catch (error) {
      console.error('[ActivityLogger] Failed to queue activity:', error);
    }
  }

  /**
   * Log user joined session
   */
  async logUserJoined(
    sessionId: string,
    userId: string,
    role: string,
    ipAddress?: string
  ): Promise<void> {
    await this.logActivity(
      sessionId,
      userId,
      'user_joined',
      { role },
      ipAddress
    );
  }

  /**
   * Log user left session
   */
  async logUserLeft(
    sessionId: string,
    userId: string,
    duration?: number
  ): Promise<void> {
    await this.logActivity(
      sessionId,
      userId,
      'user_left',
      { duration }
    );
  }

  /**
   * Log comment added
   */
  async logCommentAdded(
    sessionId: string,
    userId: string,
    commentId: string,
    targetType: string,
    targetId: string
  ): Promise<void> {
    await this.logActivity(
      sessionId,
      userId,
      'comment_added',
      { commentId, targetType, targetId }
    );
  }

  /**
   * Log action taken
   */
  async logActionTaken(
    sessionId: string,
    userId: string,
    action: string,
    target: string,
    result: string
  ): Promise<void> {
    await this.logActivity(
      sessionId,
      userId,
      'action_taken',
      { action, target, result }
    );
  }

  /**
   * Get session activity log
   */
  async getSessionActivity(sessionId: string, limit?: number): Promise<ActivityLog[]> {
    try {
      return await this.activityRepo.getSessionActivity(sessionId, limit);
    } catch (error) {
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        `Failed to get session activity: ${(error as Error).message}`,
        { sessionId }
      );
    }
  }

  /**
   * Get user activity log
   */
  async getUserActivity(userId: string, limit?: number): Promise<ActivityLog[]> {
    try {
      return await this.activityRepo.getUserActivity(userId, limit);
    } catch (error) {
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        `Failed to get user activity: ${(error as Error).message}`,
        { userId }
      );
    }
  }

  /**
   * Get activities with filters
   */
  async getActivities(filters: ActivityQueryFilters): Promise<ActivityLog[]> {
    try {
      return await this.activityRepo.getActivities(filters);
    } catch (error) {
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        `Failed to get activities: ${(error as Error).message}`,
        { filters }
      );
    }
  }

  /**
   * Get session activity summary
   */
  async getSessionSummary(sessionId: string): Promise<ActivitySummary | null> {
    try {
      return await this.activityRepo.getSessionSummary(sessionId);
    } catch (error) {
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        `Failed to get session summary: ${(error as Error).message}`,
        { sessionId }
      );
    }
  }

  /**
   * Get activity timeline for a session
   */
  async getActivityTimeline(sessionId: string): Promise<Array<{ hour: Date; count: number }>> {
    try {
      return await this.activityRepo.getActivityTimeline(sessionId);
    } catch (error) {
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        `Failed to get activity timeline: ${(error as Error).message}`,
        { sessionId }
      );
    }
  }

  /**
   * Get activity count by type for a session
   */
  async getActivityCountByType(sessionId: string): Promise<Record<string, number>> {
    try {
      return await this.activityRepo.getActivityCountByType(sessionId);
    } catch (error) {
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        `Failed to get activity count by type: ${(error as Error).message}`,
        { sessionId }
      );
    }
  }

  /**
   * Get recent activities across all sessions
   */
  async getRecentActivities(limit: number = 50): Promise<ActivityLog[]> {
    try {
      return await this.activityRepo.getRecentActivities(limit);
    } catch (error) {
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        `Failed to get recent activities: ${(error as Error).message}`,
        { limit }
      );
    }
  }

  /**
   * Generate audit trail for a session
   */
  async generateAuditTrail(sessionId: string): Promise<AuditTrailEntry[]> {
    try {
      const activities = await this.activityRepo.getSessionActivity(sessionId, 1000);
      
      const auditTrail: AuditTrailEntry[] = [];

      for (const activity of activities) {
        let username: string | undefined;
        if (activity.userId && this.getUserName) {
          try {
            username = await this.getUserName(activity.userId);
          } catch (error) {
            console.warn(`[ActivityLogger] Could not fetch username for ${activity.userId}`);
          }
        }

        auditTrail.push({
          timestamp: activity.createdAt,
          sessionId: activity.sessionId,
          userId: activity.userId || null,
          username,
          activityType: activity.activityType,
          description: this.formatActivityDescription(activity),
          details: activity.details
        });
      }

      return auditTrail;
    } catch (error) {
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        `Failed to generate audit trail: ${(error as Error).message}`,
        { sessionId }
      );
    }
  }

  /**
   * Export audit trail as CSV
   */
  async exportAuditTrailCSV(sessionId: string): Promise<string> {
    try {
      const auditTrail = await this.generateAuditTrail(sessionId);
      
      // CSV header
      let csv = 'Timestamp,Session ID,User ID,Username,Activity Type,Description\n';
      
      // CSV rows
      for (const entry of auditTrail) {
        csv += `${entry.timestamp.toISOString()},`;
        csv += `${entry.sessionId},`;
        csv += `${entry.userId || 'N/A'},`;
        csv += `${entry.username || 'Unknown'},`;
        csv += `${entry.activityType},`;
        csv += `"${entry.description.replace(/"/g, '""')}"\n`;
      }
      
      return csv;
    } catch (error) {
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        `Failed to export audit trail: ${(error as Error).message}`,
        { sessionId }
      );
    }
  }

  /**
   * Get activity statistics for a session
   */
  async getActivityStatistics(sessionId: string): Promise<{
    totalActivities: number;
    uniqueUsers: number;
    activityTypes: Record<string, number>;
    peakHour: Date | null;
    averageActivitiesPerHour: number;
  }> {
    try {
      const summary = await this.activityRepo.getSessionSummary(sessionId);
      if (!summary) {
        return {
          totalActivities: 0,
          uniqueUsers: 0,
          activityTypes: {},
          peakHour: null,
          averageActivitiesPerHour: 0
        };
      }

      const timeline = await this.activityRepo.getActivityTimeline(sessionId);
      
      let peakHour: Date | null = null;
      let maxCount = 0;
      for (const entry of timeline) {
        if (entry.count > maxCount) {
          maxCount = entry.count;
          peakHour = entry.hour;
        }
      }

      const durationHours = 
        (summary.lastActivity.getTime() - summary.firstActivity.getTime()) / (1000 * 60 * 60);
      const averageActivitiesPerHour = durationHours > 0 
        ? summary.totalActivities / durationHours 
        : 0;

      return {
        totalActivities: summary.totalActivities,
        uniqueUsers: summary.uniqueUsers,
        activityTypes: summary.activityTypes,
        peakHour,
        averageActivitiesPerHour
      };
    } catch (error) {
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        `Failed to get activity statistics: ${(error as Error).message}`,
        { sessionId }
      );
    }
  }

  /**
   * Format activity description for human readability
   */
  private formatActivityDescription(activity: ActivityLog): string {
    switch (activity.activityType) {
      case 'user_joined':
        return `User joined session as ${activity.details.role || 'participant'}`;
      case 'user_left':
        const duration = activity.details.duration 
          ? ` after ${Math.round(activity.details.duration / 60000)} minutes`
          : '';
        return `User left session${duration}`;
      case 'comment_added':
        return `Comment added on ${activity.details.targetType} ${activity.details.targetId}`;
      case 'action_taken':
        return `Action taken: ${activity.details.action} on ${activity.details.target} (${activity.details.result})`;
      default:
        return `Activity: ${activity.activityType}`;
    }
  }

  /**
   * Cleanup old activities
   */
  async cleanupOldActivities(daysOld: number = 90): Promise<number> {
    try {
      return await this.activityRepo.deleteOldActivities(daysOld);
    } catch (error) {
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        `Failed to cleanup old activities: ${(error as Error).message}`,
        { daysOld }
      );
    }
  }

  /**
   * Flush any queued activities (call on shutdown)
   */
  async shutdown(): Promise<void> {
    try {
      await this.activityRepo.shutdown();
      console.log('[ActivityLogger] Shutdown complete, all activities flushed');
    } catch (error) {
      console.error('[ActivityLogger] Error during shutdown:', error);
    }
  }
}

/**
 * Create an ActivityLogger instance
 */
export function createActivityLogger(
  activityRepo: ActivityRepository,
  getUserName?: (userId: string) => Promise<string>
): ActivityLogger {
  return new ActivityLogger(activityRepo, getUserName);
}