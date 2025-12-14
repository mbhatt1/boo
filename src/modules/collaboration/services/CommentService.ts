/**
 * Comment Service - Phase 4
 * 
 * High-level service for managing comments, reactions, and threading.
 * Handles comment lifecycle, permissions, moderation, and integrates with
 * the database layer and notification system.
 * 
 * Features:
 * - Comment creation with threading (parent/child)
 * - Comment editing with version history
 * - Soft delete with audit trail
 * - Reactions (like, flag, resolve, question)
 * - Mention detection and notifications
 * - Search and filtering
 * - Permission checks
 * - Rate limiting
 */

import {
  Comment,
  CommentWithAuthor,
  CommentReaction,
  CommentVersion,
  CommentTargetType,
  ReactionType,
  CollaborationError,
  CollaborationErrorCode,
  UserRole
} from '../types';
import { CommentRepository } from '../repositories/CommentRepository';
import { SessionManager } from './SessionManager';

/**
 * Rate limit tracker for comment creation
 */
interface RateLimitEntry {
  count: number;
  resetAt: number;
}

/**
 * CommentService - Manages comments and reactions
 */
export class CommentService {
  private rateLimitMap: Map<string, RateLimitEntry> = new Map();
  private readonly RATE_LIMIT_PER_MINUTE = 10;
  private readonly RATE_LIMIT_WINDOW_MS = 60000; // 1 minute

  constructor(
    private commentRepo: CommentRepository,
    private sessionManager: SessionManager
  ) {
    // Clean up rate limit map every 5 minutes
    setInterval(() => this.cleanupRateLimits(), 300000);
  }

  /**
   * Create a new comment
   */
  async createComment(
    sessionId: string,
    authorId: string,
    targetType: CommentTargetType,
    targetId: string,
    content: string,
    eventId?: string,
    parentId?: string,
    metadata?: Record<string, any>
  ): Promise<CommentWithAuthor> {
    try {
      // Check rate limit
      if (!this.checkRateLimit(authorId)) {
        throw new CollaborationError(
          CollaborationErrorCode.RATE_LIMIT_EXCEEDED,
          'Comment rate limit exceeded. Please wait before posting again.',
          { authorId, sessionId }
        );
      }

      // Verify session exists
      const session = await this.sessionManager.getSession(sessionId);
      if (!session) {
        throw new CollaborationError(
          CollaborationErrorCode.SESSION_NOT_FOUND,
          'Session not found',
          { sessionId }
        );
      }

      // Check if user is participant with comment permission
      const hasPermission = await this.canUserComment(sessionId, authorId);
      if (!hasPermission) {
        throw new CollaborationError(
          CollaborationErrorCode.PERMISSION_DENIED,
          'User does not have permission to comment in this session',
          { sessionId, authorId }
        );
      }

      // Sanitize content (XSS prevention)
      const sanitizedContent = this.sanitizeContent(content);

      // Validate parent comment if provided
      if (parentId) {
        const parentComment = await this.commentRepo.getCommentWithAuthorById(parentId);
        if (parentComment.sessionId !== sessionId) {
          throw new CollaborationError(
            CollaborationErrorCode.INVALID_MESSAGE,
            'Parent comment must be in the same session',
            { parentId, sessionId }
          );
        }
      }

      // Create comment
      const comment = await this.commentRepo.createComment({
        sessionId,
        authorId,
        parentId,
        targetType,
        targetId,
        eventId,
        content: sanitizedContent,
        metadata
      });

      // Increment rate limit counter
      this.incrementRateLimit(authorId);

      console.log(`[CommentService] Created comment ${comment.id} by user ${authorId} in session ${sessionId}`);

      return comment;
    } catch (error) {
      if (error instanceof CollaborationError) {
        throw error;
      }
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        `Failed to create comment: ${(error as Error).message}`,
        { sessionId, authorId }
      );
    }
  }

  /**
   * Edit an existing comment
   */
  async editComment(
    commentId: string,
    content: string,
    userId: string
  ): Promise<CommentWithAuthor> {
    try {
      // Get existing comment
      const existingComment = await this.commentRepo.getCommentWithAuthorById(commentId);

      // Check if user is the author or has admin role
      const canEdit = await this.canUserEditComment(commentId, userId);
      if (!canEdit) {
        throw new CollaborationError(
          CollaborationErrorCode.PERMISSION_DENIED,
          'User does not have permission to edit this comment',
          { commentId, userId }
        );
      }

      // Sanitize content
      const sanitizedContent = this.sanitizeContent(content);

      // Update comment (version history created automatically by trigger)
      const updatedComment = await this.commentRepo.updateComment(
        commentId,
        sanitizedContent,
        userId
      );

      console.log(`[CommentService] Edited comment ${commentId} by user ${userId}`);

      return updatedComment;
    } catch (error) {
      if (error instanceof CollaborationError) {
        throw error;
      }
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        `Failed to edit comment: ${(error as Error).message}`,
        { commentId, userId }
      );
    }
  }

  /**
   * Delete a comment (soft delete)
   */
  async deleteComment(commentId: string, userId: string): Promise<void> {
    try {
      // Check if user can delete
      const canDelete = await this.canUserDeleteComment(commentId, userId);
      if (!canDelete) {
        throw new CollaborationError(
          CollaborationErrorCode.PERMISSION_DENIED,
          'User does not have permission to delete this comment',
          { commentId, userId }
        );
      }

      await this.commentRepo.deleteComment(commentId);

      console.log(`[CommentService] Deleted comment ${commentId} by user ${userId}`);
    } catch (error) {
      if (error instanceof CollaborationError) {
        throw error;
      }
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        `Failed to delete comment: ${(error as Error).message}`,
        { commentId, userId }
      );
    }
  }

  /**
   * Add or remove reaction to comment
   */
  async reactToComment(
    commentId: string,
    userId: string,
    reactionType: ReactionType
  ): Promise<CommentReaction | null> {
    try {
      // Verify comment exists
      const comment = await this.commentRepo.getCommentWithAuthorById(commentId);

      // Check if user is session participant
      const hasPermission = await this.canUserComment(comment.sessionId, userId);
      if (!hasPermission) {
        throw new CollaborationError(
          CollaborationErrorCode.PERMISSION_DENIED,
          'User does not have permission to react in this session',
          { commentId, userId }
        );
      }

      // Toggle reaction
      const reaction = await this.commentRepo.toggleReaction(commentId, userId, reactionType);

      const action = reaction ? 'added' : 'removed';
      console.log(`[CommentService] User ${userId} ${action} ${reactionType} reaction to comment ${commentId}`);

      return reaction;
    } catch (error) {
      if (error instanceof CollaborationError) {
        throw error;
      }
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        `Failed to react to comment: ${(error as Error).message}`,
        { commentId, userId, reactionType }
      );
    }
  }

  /**
   * Get comments for a session with optional filters
   */
  async getComments(
    sessionId: string,
    userId: string,
    filters?: {
      eventId?: string;
      targetType?: CommentTargetType;
      targetId?: string;
      parentId?: string | null;
      includeDeleted?: boolean;
      limit?: number;
      offset?: number;
    }
  ): Promise<CommentWithAuthor[]> {
    try {
      // Verify user has access to session
      const hasAccess = await this.canUserViewSession(sessionId, userId);
      if (!hasAccess) {
        throw new CollaborationError(
          CollaborationErrorCode.PERMISSION_DENIED,
          'User does not have permission to view comments in this session',
          { sessionId, userId }
        );
      }

      return await this.commentRepo.getComments({
        sessionId,
        ...filters
      });
    } catch (error) {
      if (error instanceof CollaborationError) {
        throw error;
      }
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        `Failed to get comments: ${(error as Error).message}`,
        { sessionId, userId }
      );
    }
  }

  /**
   * Get comment thread (parent and all replies)
   */
  async getCommentThread(commentId: string, userId: string): Promise<CommentWithAuthor[]> {
    try {
      // Get root comment to verify session access
      const rootComment = await this.commentRepo.getCommentWithAuthorById(commentId);

      // Check permission
      const hasAccess = await this.canUserViewSession(rootComment.sessionId, userId);
      if (!hasAccess) {
        throw new CollaborationError(
          CollaborationErrorCode.PERMISSION_DENIED,
          'User does not have permission to view this comment thread',
          { commentId, userId }
        );
      }

      return await this.commentRepo.getCommentThread(commentId);
    } catch (error) {
      if (error instanceof CollaborationError) {
        throw error;
      }
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        `Failed to get comment thread: ${(error as Error).message}`,
        { commentId, userId }
      );
    }
  }

  /**
   * Get comment version history
   */
  async getCommentVersions(commentId: string, userId: string): Promise<CommentVersion[]> {
    try {
      // Get comment to verify session access
      const comment = await this.commentRepo.getCommentWithAuthorById(commentId);

      // Check permission
      const hasAccess = await this.canUserViewSession(comment.sessionId, userId);
      if (!hasAccess) {
        throw new CollaborationError(
          CollaborationErrorCode.PERMISSION_DENIED,
          'User does not have permission to view comment history',
          { commentId, userId }
        );
      }

      return await this.commentRepo.getCommentVersions(commentId);
    } catch (error) {
      if (error instanceof CollaborationError) {
        throw error;
      }
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        `Failed to get comment versions: ${(error as Error).message}`,
        { commentId, userId }
      );
    }
  }

  /**
   * Search comments in a session
   */
  async searchComments(
    sessionId: string,
    userId: string,
    searchTerm: string,
    limit: number = 50
  ): Promise<CommentWithAuthor[]> {
    try {
      // Verify access
      const hasAccess = await this.canUserViewSession(sessionId, userId);
      if (!hasAccess) {
        throw new CollaborationError(
          CollaborationErrorCode.PERMISSION_DENIED,
          'User does not have permission to search comments in this session',
          { sessionId, userId }
        );
      }

      return await this.commentRepo.searchComments(sessionId, searchTerm, limit);
    } catch (error) {
      if (error instanceof CollaborationError) {
        throw error;
      }
      throw new CollaborationError(
        CollaborationErrorCode.DATABASE_ERROR,
        `Failed to search comments: ${(error as Error).message}`,
        { sessionId, userId, searchTerm }
      );
    }
  }

  /**
   * Check if user can comment in a session
   */
  private async canUserComment(sessionId: string, userId: string): Promise<boolean> {
    try {
      const participants = await this.sessionManager.getParticipants(sessionId);
      const participant = participants.find(p => p.userId === userId);
      
      if (!participant) {
        return false;
      }

      // Viewers cannot comment
      return participant.role !== 'viewer';
    } catch (error) {
      console.error('[CommentService] Error checking comment permission:', error);
      return false;
    }
  }

  /**
   * Check if user can view session
   */
  private async canUserViewSession(sessionId: string, userId: string): Promise<boolean> {
    try {
      const participants = await this.sessionManager.getParticipants(sessionId);
      return participants.some(p => p.userId === userId);
    } catch (error) {
      console.error('[CommentService] Error checking view permission:', error);
      return false;
    }
  }

  /**
   * Check if user can edit a comment
   */
  private async canUserEditComment(commentId: string, userId: string): Promise<boolean> {
    try {
      const comment = await this.commentRepo.getCommentWithAuthorById(commentId);
      
      // User is the author
      if (comment.authorId === userId) {
        return true;
      }

      // User is admin/operator in the session
      const participants = await this.sessionManager.getParticipants(comment.sessionId);
      const participant = participants.find(p => p.userId === userId);
      
      return participant?.role === 'operator';
    } catch (error) {
      console.error('[CommentService] Error checking edit permission:', error);
      return false;
    }
  }

  /**
   * Check if user can delete a comment
   */
  private async canUserDeleteComment(commentId: string, userId: string): Promise<boolean> {
    try {
      const comment = await this.commentRepo.getCommentWithAuthorById(commentId);
      
      // User is the author
      if (comment.authorId === userId) {
        return true;
      }

      // User is operator in the session (moderation)
      const participants = await this.sessionManager.getParticipants(comment.sessionId);
      const participant = participants.find(p => p.userId === userId);
      
      return participant?.role === 'operator';
    } catch (error) {
      console.error('[CommentService] Error checking delete permission:', error);
      return false;
    }
  }

  /**
   * Sanitize comment content (XSS prevention)
   */
  private sanitizeContent(content: string): string {
    // Basic XSS prevention - remove script tags and potentially harmful content
    // In production, use a proper sanitization library like DOMPurify
    return content
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '')
      .trim();
  }

  /**
   * Check rate limit for user
   */
  private checkRateLimit(userId: string): boolean {
    const now = Date.now();
    const entry = this.rateLimitMap.get(userId);

    if (!entry) {
      return true;
    }

    // Reset if window expired
    if (now > entry.resetAt) {
      this.rateLimitMap.delete(userId);
      return true;
    }

    // Check if under limit
    return entry.count < this.RATE_LIMIT_PER_MINUTE;
  }

  /**
   * Increment rate limit counter
   */
  private incrementRateLimit(userId: string): void {
    const now = Date.now();
    const entry = this.rateLimitMap.get(userId);

    if (!entry || now > entry.resetAt) {
      this.rateLimitMap.set(userId, {
        count: 1,
        resetAt: now + this.RATE_LIMIT_WINDOW_MS
      });
    } else {
      entry.count++;
    }
  }

  /**
   * Clean up expired rate limit entries
   */
  private cleanupRateLimits(): void {
    const now = Date.now();
    for (const [userId, entry] of this.rateLimitMap.entries()) {
      if (now > entry.resetAt) {
        this.rateLimitMap.delete(userId);
      }
    }
  }
}