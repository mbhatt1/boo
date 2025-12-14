/**
 * Comment Repository - Phase 4
 * 
 * Database repository layer for comments, reactions, versions, and mentions.
 * Handles all database queries related to comment management with
 * transaction support, threading, and efficient JOINs for performance.
 */

import {
  Comment,
  CommentWithAuthor,
  CommentReaction,
  CommentVersion,
  Notification,
  CommentTargetType,
  ReactionType,
  NotificationType,
  CollaborationError,
  CollaborationErrorCode
} from '../types';
import { DatabaseClient } from './SessionRepository';

/**
 * Comment creation parameters
 */
export interface CreateCommentParams {
  sessionId: string;
  authorId: string;
  parentId?: string;
  targetType: CommentTargetType;
  targetId: string;
  eventId?: string;
  content: string;
  metadata?: Record<string, any>;
}

/**
 * Comment query parameters
 */
export interface CommentQueryParams {
  sessionId: string;
  eventId?: string;
  targetType?: CommentTargetType;
  targetId?: string;
  parentId?: string | null;
  includeDeleted?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * CommentRepository - Database operations for comments and related entities
 */
export class CommentRepository {
  constructor(private db: DatabaseClient) {}

  /**
   * Create a new comment
   */
  async createComment(params: CreateCommentParams): Promise<CommentWithAuthor> {
    try {
      const sql = `
        INSERT INTO comments (
          session_id, author_id, parent_id, target_type, target_id, 
          event_id, content, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `;

      const result = await this.db.query(sql, [
        params.sessionId,
        params.authorId,
        params.parentId || null,
        params.targetType,
        params.targetId,
        params.eventId || null,
        params.content,
        JSON.stringify(params.metadata || {})
      ]);

      // Fetch complete comment with author details
      return await this.getCommentWithAuthorById(result.rows[0].id);
    } catch (error) {
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        `Failed to create comment: ${(error as Error).message}`,
        { params }
      );
    }
  }

  /**
   * Get comment by ID with author details, reactions, and reply count
   */
  async getCommentWithAuthorById(commentId: string): Promise<CommentWithAuthor> {
    try {
      const sql = `
        SELECT 
          c.*,
          u.id as author_id,
          u.username as author_username,
          u.full_name as author_full_name,
          u.role as author_role,
          COUNT(DISTINCT r.id) as reaction_count,
          COUNT(DISTINCT cr.id) FILTER (WHERE cr.deleted_at IS NULL) as reply_count
        FROM comments c
        JOIN users u ON c.author_id = u.id
        LEFT JOIN comment_reactions r ON c.id = r.comment_id
        LEFT JOIN comments cr ON c.id = cr.parent_id
        WHERE c.id = $1
        GROUP BY c.id, u.id, u.username, u.full_name, u.role
      `;

      const result = await this.db.query(sql, [commentId]);
      
      if (result.rows.length === 0) {
        throw new CollaborationError(
          CollaborationErrorCode.DATABASE_ERROR,
          'Comment not found',
          { commentId }
        );
      }

      const comment = this.mapRowToCommentWithAuthor(result.rows[0]);
      
      // Fetch reactions
      comment.reactions = await this.getCommentReactions(commentId);
      
      // Extract mentions from content
      comment.mentions = this.extractMentions(comment.content);

      return comment;
    } catch (error) {
      if (error instanceof CollaborationError) {
        throw error;
      }
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        `Failed to get comment: ${(error as Error).message}`,
        { commentId }
      );
    }
  }

  /**
   * Get comments for a session with filters
   */
  async getComments(params: CommentQueryParams): Promise<CommentWithAuthor[]> {
    try {
      const conditions: string[] = ['c.session_id = $1'];
      const values: any[] = [params.sessionId];
      let paramCount = 1;

      if (params.eventId !== undefined) {
        conditions.push(`c.event_id = $${++paramCount}`);
        values.push(params.eventId);
      }

      if (params.targetType !== undefined) {
        conditions.push(`c.target_type = $${++paramCount}`);
        values.push(params.targetType);
      }

      if (params.targetId !== undefined) {
        conditions.push(`c.target_id = $${++paramCount}`);
        values.push(params.targetId);
      }

      if (params.parentId !== undefined) {
        if (params.parentId === null) {
          conditions.push('c.parent_id IS NULL');
        } else {
          conditions.push(`c.parent_id = $${++paramCount}`);
          values.push(params.parentId);
        }
      }

      if (!params.includeDeleted) {
        conditions.push('c.deleted_at IS NULL');
      }

      const sql = `
        SELECT 
          c.*,
          u.id as author_id,
          u.username as author_username,
          u.full_name as author_full_name,
          u.role as author_role,
          COUNT(DISTINCT cr.id) FILTER (WHERE cr.deleted_at IS NULL) as reply_count
        FROM comments c
        JOIN users u ON c.author_id = u.id
        LEFT JOIN comments cr ON c.id = cr.parent_id
        WHERE ${conditions.join(' AND ')}
        GROUP BY c.id, u.id, u.username, u.full_name, u.role
        ORDER BY c.created_at ASC
        LIMIT $${++paramCount} OFFSET $${++paramCount}
      `;

      values.push(params.limit || 50, params.offset || 0);

      const result = await this.db.query(sql, values);
      
      const comments = result.rows.map((row: any) => this.mapRowToCommentWithAuthor(row));
      
      // Fetch reactions for all comments in batch
      if (comments.length > 0) {
        const commentIds = comments.map((c: CommentWithAuthor) => c.id);
        const reactionsMap = await this.getCommentReactionsBatch(commentIds);
        
        for (const comment of comments) {
          comment.reactions = reactionsMap.get(comment.id) || [];
          comment.mentions = this.extractMentions(comment.content);
        }
      }

      return comments;
    } catch (error) {
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        `Failed to get comments: ${(error as Error).message}`,
        { params }
      );
    }
  }

  /**
   * Get comment thread (parent and all descendants)
   */
  async getCommentThread(commentId: string): Promise<CommentWithAuthor[]> {
    try {
      // Recursive CTE to get entire thread
      const sql = `
        WITH RECURSIVE thread AS (
          -- Base case: get the root comment
          SELECT c.*, 0 as depth
          FROM comments c
          WHERE c.id = $1
          
          UNION ALL
          
          -- Recursive case: get all replies
          SELECT c.*, t.depth + 1
          FROM comments c
          JOIN thread t ON c.parent_id = t.id
          WHERE c.deleted_at IS NULL
        )
        SELECT 
          t.*,
          u.id as author_id,
          u.username as author_username,
          u.full_name as author_full_name,
          u.role as author_role,
          COUNT(DISTINCT cr.id) FILTER (WHERE cr.deleted_at IS NULL) as reply_count
        FROM thread t
        JOIN users u ON t.author_id = u.id
        LEFT JOIN comments cr ON t.id = cr.parent_id
        GROUP BY t.id, t.session_id, t.author_id, t.parent_id, t.target_type, 
                 t.target_id, t.event_id, t.content, t.metadata, t.created_at, 
                 t.updated_at, t.deleted_at, t.depth, u.id, u.username, u.full_name, u.role
        ORDER BY t.depth, t.created_at ASC
      `;

      const result = await this.db.query(sql, [commentId]);
      const comments = result.rows.map((row: any) => this.mapRowToCommentWithAuthor(row));
      
      // Fetch reactions for all comments
      if (comments.length > 0) {
        const commentIds = comments.map((c: CommentWithAuthor) => c.id);
        const reactionsMap = await this.getCommentReactionsBatch(commentIds);
        
        for (const comment of comments) {
          comment.reactions = reactionsMap.get(comment.id) || [];
          comment.mentions = this.extractMentions(comment.content);
        }
      }

      return comments;
    } catch (error) {
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        `Failed to get comment thread: ${(error as Error).message}`,
        { commentId }
      );
    }
  }

  /**
   * Update comment content (creates version history)
   */
  async updateComment(commentId: string, content: string, editorId: string): Promise<CommentWithAuthor> {
    try {
      const sql = `
        UPDATE comments
        SET content = $1, updated_at = NOW()
        WHERE id = $2 AND deleted_at IS NULL
        RETURNING *
      `;

      const result = await this.db.query(sql, [content, commentId]);
      
      if (result.rows.length === 0) {
        throw new CollaborationError(
          CollaborationErrorCode.DATABASE_ERROR,
          'Comment not found or already deleted',
          { commentId }
        );
      }

      // Version history is automatically created by database trigger
      return await this.getCommentWithAuthorById(commentId);
    } catch (error) {
      if (error instanceof CollaborationError) {
        throw error;
      }
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        `Failed to update comment: ${(error as Error).message}`,
        { commentId, content }
      );
    }
  }

  /**
   * Soft delete a comment
   */
  async deleteComment(commentId: string): Promise<void> {
    try {
      const sql = `
        UPDATE comments
        SET deleted_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL
      `;

      const result = await this.db.query(sql, [commentId]);
      
      if (result.rowCount === 0) {
        throw new CollaborationError(
          CollaborationErrorCode.DATABASE_ERROR,
          'Comment not found or already deleted',
          { commentId }
        );
      }
    } catch (error) {
      if (error instanceof CollaborationError) {
        throw error;
      }
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        `Failed to delete comment: ${(error as Error).message}`,
        { commentId }
      );
    }
  }

  /**
   * Add or remove reaction to comment
   */
  async toggleReaction(commentId: string, userId: string, reactionType: ReactionType): Promise<CommentReaction | null> {
    try {
      // Check if reaction already exists
      const checkSql = `
        SELECT * FROM comment_reactions
        WHERE comment_id = $1 AND user_id = $2 AND reaction_type = $3
      `;
      
      const existing = await this.db.query(checkSql, [commentId, userId, reactionType]);
      
      if (existing.rows.length > 0) {
        // Remove reaction
        const deleteSql = `
          DELETE FROM comment_reactions
          WHERE id = $1
        `;
        await this.db.query(deleteSql, [existing.rows[0].id]);
        return null;
      } else {
        // Add reaction
        const insertSql = `
          INSERT INTO comment_reactions (comment_id, user_id, reaction_type)
          VALUES ($1, $2, $3)
          RETURNING *
        `;
        
        const result = await this.db.query(insertSql, [commentId, userId, reactionType]);
        return this.mapRowToReaction(result.rows[0]);
      }
    } catch (error) {
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        `Failed to toggle reaction: ${(error as Error).message}`,
        { commentId, userId, reactionType }
      );
    }
  }

  /**
   * Get all reactions for a comment
   */
  async getCommentReactions(commentId: string): Promise<CommentReaction[]> {
    try {
      const sql = `
        SELECT r.*, u.username
        FROM comment_reactions r
        JOIN users u ON r.user_id = u.id
        WHERE r.comment_id = $1
        ORDER BY r.created_at ASC
      `;

      const result = await this.db.query(sql, [commentId]);
      return result.rows.map((row: any) => this.mapRowToReaction(row));
    } catch (error) {
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        `Failed to get comment reactions: ${(error as Error).message}`,
        { commentId }
      );
    }
  }

  /**
   * Get reactions for multiple comments (batch operation)
   */
  private async getCommentReactionsBatch(commentIds: string[]): Promise<Map<string, CommentReaction[]>> {
    try {
      const sql = `
        SELECT r.*, u.username
        FROM comment_reactions r
        JOIN users u ON r.user_id = u.id
        WHERE r.comment_id = ANY($1::uuid[])
        ORDER BY r.created_at ASC
      `;

      const result = await this.db.query(sql, [commentIds]);
      
      const reactionsMap = new Map<string, CommentReaction[]>();
      for (const row of result.rows) {
        const reaction = this.mapRowToReaction(row);
        if (!reactionsMap.has(reaction.commentId)) {
          reactionsMap.set(reaction.commentId, []);
        }
        reactionsMap.get(reaction.commentId)!.push(reaction);
      }
      
      return reactionsMap;
    } catch (error) {
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        `Failed to get comment reactions batch: ${(error as Error).message}`,
        { commentIds }
      );
    }
  }

  /**
   * Get version history for a comment
   */
  async getCommentVersions(commentId: string): Promise<CommentVersion[]> {
    try {
      const sql = `
        SELECT v.*, u.username as editor_username
        FROM comment_versions v
        JOIN users u ON v.edited_by = u.id
        WHERE v.comment_id = $1
        ORDER BY v.version DESC
      `;

      const result = await this.db.query(sql, [commentId]);
      return result.rows.map((row: any) => this.mapRowToVersion(row));
    } catch (error) {
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        `Failed to get comment versions: ${(error as Error).message}`,
        { commentId }
      );
    }
  }

  /**
   * Get notifications for a user
   */
  async getUserNotifications(userId: string, unreadOnly: boolean = false, limit: number = 50): Promise<Notification[]> {
    try {
      let sql = `
        SELECT n.*, u.username as from_username
        FROM notifications n
        JOIN users u ON n.from_user_id = u.id
        WHERE n.user_id = $1
      `;

      if (unreadOnly) {
        sql += ' AND n.is_read = FALSE';
      }

      sql += ' ORDER BY n.created_at DESC LIMIT $2';

      const result = await this.db.query(sql, [userId, limit]);
      return result.rows.map((row: any) => this.mapRowToNotification(row));
    } catch (error) {
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        `Failed to get user notifications: ${(error as Error).message}`,
        { userId }
      );
    }
  }

  /**
   * Mark notification as read
   */
  async markNotificationRead(notificationId: string): Promise<void> {
    try {
      const sql = `
        UPDATE notifications
        SET is_read = TRUE, read_at = NOW()
        WHERE id = $1
      `;

      await this.db.query(sql, [notificationId]);
    } catch (error) {
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        `Failed to mark notification as read: ${(error as Error).message}`,
        { notificationId }
      );
    }
  }

  /**
   * Get unread notification count for a user
   */
  async getUnreadNotificationCount(userId: string): Promise<number> {
    try {
      const sql = `
        SELECT COUNT(*) as count
        FROM notifications
        WHERE user_id = $1 AND is_read = FALSE
      `;

      const result = await this.db.query(sql, [userId]);
      return parseInt(result.rows[0].count, 10);
    } catch (error) {
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        `Failed to get unread notification count: ${(error as Error).message}`,
        { userId }
      );
    }
  }

  /**
   * Search comments by content
   */
  async searchComments(sessionId: string, searchTerm: string, limit: number = 50): Promise<CommentWithAuthor[]> {
    try {
      const sql = `
        SELECT 
          c.*,
          u.id as author_id,
          u.username as author_username,
          u.full_name as author_full_name,
          u.role as author_role,
          COUNT(DISTINCT cr.id) FILTER (WHERE cr.deleted_at IS NULL) as reply_count
        FROM comments c
        JOIN users u ON c.author_id = u.id
        LEFT JOIN comments cr ON c.id = cr.parent_id
        WHERE c.session_id = $1 
          AND c.deleted_at IS NULL
          AND c.content ILIKE $2
        GROUP BY c.id, u.id, u.username, u.full_name, u.role
        ORDER BY c.created_at DESC
        LIMIT $3
      `;

      const result = await this.db.query(sql, [sessionId, `%${searchTerm}%`, limit]);
      const comments = result.rows.map((row: any) => this.mapRowToCommentWithAuthor(row));
      
      // Fetch reactions
      if (comments.length > 0) {
        const commentIds = comments.map((c: CommentWithAuthor) => c.id);
        const reactionsMap = await this.getCommentReactionsBatch(commentIds);
        
        for (const comment of comments) {
          comment.reactions = reactionsMap.get(comment.id) || [];
          comment.mentions = this.extractMentions(comment.content);
        }
      }

      return comments;
    } catch (error) {
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        `Failed to search comments: ${(error as Error).message}`,
        { sessionId, searchTerm }
      );
    }
  }

  /**
   * Extract @mentions from comment content
   */
  private extractMentions(content: string): string[] {
    const mentionRegex = /@(\w+)/g;
    const mentions: string[] = [];
    let match;
    
    while ((match = mentionRegex.exec(content)) !== null) {
      mentions.push(match[1]);
    }
    
    return [...new Set(mentions)]; // Remove duplicates
  }

  /**
   * Map database row to Comment entity
   */
  private mapRowToComment(row: any): Comment {
    return {
      id: row.id,
      sessionId: row.session_id,
      authorId: row.author_id,
      targetType: row.target_type,
      targetId: row.target_id,
      content: row.content,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      deletedAt: row.deleted_at ? new Date(row.deleted_at) : undefined
    };
  }

  /**
   * Map database row to CommentWithAuthor entity
   */
  private mapRowToCommentWithAuthor(row: any): CommentWithAuthor {
    return {
      ...this.mapRowToComment(row),
      author: {
        userId: row.author_id,
        username: row.author_username,
        fullName: row.author_full_name,
        role: row.author_role
      },
      reactions: [], // Will be populated separately
      replyCount: parseInt(row.reply_count || '0', 10),
      mentions: [] // Will be populated separately
    };
  }

  /**
   * Map database row to CommentReaction entity
   */
  private mapRowToReaction(row: any): CommentReaction {
    return {
      id: row.id,
      commentId: row.comment_id,
      userId: row.user_id,
      username: row.username,
      reactionType: row.reaction_type,
      createdAt: new Date(row.created_at)
    };
  }

  /**
   * Map database row to CommentVersion entity
   */
  private mapRowToVersion(row: any): CommentVersion {
    return {
      id: row.id,
      commentId: row.comment_id,
      version: row.version,
      content: row.content,
      editedAt: new Date(row.edited_at),
      editedBy: row.editor_username
    };
  }

  /**
   * Map database row to Notification entity
   */
  private mapRowToNotification(row: any): Notification {
    return {
      id: row.id,
      userId: row.user_id,
      type: row.type,
      commentId: row.comment_id,
      sessionId: row.session_id,
      fromUserId: row.from_user_id,
      fromUsername: row.from_username,
      message: row.message,
      isRead: row.is_read,
      createdAt: new Date(row.created_at)
    };
  }
}