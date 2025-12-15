/**
 * CommentService Unit Tests
 * 
 * Comprehensive tests for comment management including creation, editing,
 * deletion, reactions, threading, and permission checking.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { CommentService } from '../../services/CommentService.js';
import { CommentRepository } from '../../repositories/CommentRepository.js';
import { SessionManager } from '../../services/SessionManager.js';
import { CollaborationError } from '../../types/index.js';
import { SessionFactory, UserFactory } from '../factories/index.js';

describe('CommentService', () => {
  let commentService: CommentService;
  let mockCommentRepo: jest.Mocked<CommentRepository>;
  let mockSessionManager: jest.Mocked<SessionManager>;

  const testSession = SessionFactory.createActive();
  const testUser = UserFactory.createOperator();

  beforeEach(() => {
    mockCommentRepo = {
      createComment: jest.fn(),
      getCommentWithAuthorById: jest.fn(),
      updateComment: jest.fn(),
      deleteComment: jest.fn(),
      toggleReaction: jest.fn(),
      getComments: jest.fn(),
      getThreadComments: jest.fn(),
    } as any;

    mockSessionManager = {
      getSession: jest.fn(),
      isParticipant: jest.fn(),
      getParticipants: jest.fn(),
    } as any;

    commentService = new CommentService(mockCommentRepo, mockSessionManager);
  });

  describe('createComment', () => {
    it('should create a comment successfully', async () => {
      const mockComment = {
        id: 'comment-1',
        sessionId: testSession.sessionId,
        authorId: testUser.id,
        content: 'Test comment',
        targetType: 'event' as const,
        targetId: 'evt-123',
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {},
        author: {
          userId: testUser.id,
          username: testUser.username,
          role: 'operator' as const,
        },
        reactions: [],
      };

      mockSessionManager.getSession.mockResolvedValueOnce(testSession);
      mockSessionManager.getParticipants.mockResolvedValueOnce([
        {
          id: 'part-1',
          sessionId: testSession.sessionId,
          userId: testUser.id,
          role: 'operator' as const,
          joinedAt: new Date()
        }
      ]);
      mockSessionManager.isParticipant.mockResolvedValueOnce(true);
      mockCommentRepo.createComment.mockResolvedValueOnce(mockComment);

      const result = await commentService.createComment(
        testSession.sessionId,
        testUser.id,
        'event',
        'evt-123',
        'Test comment'
      );

      expect(result).toEqual(mockComment);
      expect(mockCommentRepo.createComment).toHaveBeenCalled();
    });

    it('should sanitize HTML content', async () => {
      const maliciousContent = '<script>alert("xss")</script>Test';

      mockSessionManager.getSession.mockResolvedValueOnce(testSession);
      mockSessionManager.getParticipants.mockResolvedValueOnce([
        {
          id: 'part-1',
          sessionId: testSession.sessionId,
          userId: testUser.id,
          role: 'operator' as const,
          joinedAt: new Date()
        }
      ]);
      mockSessionManager.isParticipant.mockResolvedValueOnce(true);
      mockCommentRepo.createComment.mockResolvedValueOnce({
        id: 'comment-1',
        content: 'sanitized content',
      } as any);

      await commentService.createComment(
        testSession.sessionId,
        testUser.id,
        'event',
        'evt-123',
        maliciousContent
      );

      // Verify sanitization happened (content shouldn't contain <script>)
      const createCall = mockCommentRepo.createComment.mock.calls[0][0];
      expect(createCall.content).not.toContain('<script>');
    });

    it('should enforce rate limiting', async () => {
      mockSessionManager.getSession.mockResolvedValue(testSession);
      mockSessionManager.getParticipants.mockResolvedValue([
        {
          id: 'part-1',
          sessionId: testSession.sessionId,
          userId: testUser.id,
          role: 'operator' as const,
          joinedAt: new Date()
        }
      ]);
      mockSessionManager.isParticipant.mockResolvedValue(true);
      mockCommentRepo.createComment.mockResolvedValue({
        id: 'comment-1',
      } as any);

      // Create 10 comments (rate limit)
      for (let i = 0; i < 10; i++) {
        await commentService.createComment(
          testSession.sessionId,
          testUser.id,
          'event',
          'evt-123',
          `Comment ${i}`
        );
      }

      // 11th comment should be rate limited
      await expect(
        commentService.createComment(
          testSession.sessionId,
          testUser.id,
          'event',
          'evt-123',
          'Comment 11'
        )
      ).rejects.toThrow('rate limit exceeded');
    });

    it('should reject comment for non-existent session', async () => {
      mockSessionManager.getSession.mockResolvedValueOnce(null);

      await expect(
        commentService.createComment(
          'nonexistent-session',
          testUser.id,
          'event',
          'evt-123',
          'Test comment'
        )
      ).rejects.toThrow(CollaborationError);
    });

    it('should reject comment from non-participant', async () => {
      mockSessionManager.getSession.mockResolvedValueOnce(testSession);
      mockSessionManager.getParticipants.mockResolvedValueOnce([]);
      mockSessionManager.isParticipant.mockResolvedValueOnce(false);

      await expect(
        commentService.createComment(
          testSession.sessionId,
          'non-participant',
          'event',
          'evt-123',
          'Test comment'
        )
      ).rejects.toThrow('does not have permission');
    });

    it('should validate parent comment belongs to same session', async () => {
      const parentComment = {
        id: 'parent-1',
        sessionId: 'different-session',
      };

      mockSessionManager.getSession.mockResolvedValueOnce(testSession);
      mockSessionManager.getParticipants.mockResolvedValueOnce([
        {
          id: 'part-1',
          sessionId: testSession.sessionId,
          userId: testUser.id,
          role: 'operator' as const,
          joinedAt: new Date()
        }
      ]);
      mockSessionManager.isParticipant.mockResolvedValueOnce(true);
      mockCommentRepo.getCommentWithAuthorById.mockResolvedValueOnce(
        parentComment as any
      );

      await expect(
        commentService.createComment(
          testSession.sessionId,
          testUser.id,
          'event',
          'evt-123',
          'Reply comment',
          undefined,
          'parent-1'
        )
      ).rejects.toThrow('must be in the same session');
    });

    it('should create threaded reply', async () => {
      const parentComment = {
        id: 'parent-1',
        sessionId: testSession.sessionId,
      };

      mockSessionManager.getSession.mockResolvedValueOnce(testSession);
      mockSessionManager.getParticipants.mockResolvedValueOnce([
        {
          id: 'part-1',
          sessionId: testSession.sessionId,
          userId: testUser.id,
          role: 'operator' as const,
          joinedAt: new Date()
        }
      ]);
      mockSessionManager.isParticipant.mockResolvedValueOnce(true);
      mockCommentRepo.getCommentWithAuthorById.mockResolvedValueOnce(
        parentComment as any
      );
      mockCommentRepo.createComment.mockResolvedValueOnce({
        id: 'reply-1',
        parentId: 'parent-1',
        sessionId: testSession.sessionId,
        authorId: testUser.id,
        content: 'Reply comment',
        targetType: 'event',
        targetId: 'evt-123',
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: { parentId: 'parent-1' },
        author: {
          userId: testUser.id,
          username: testUser.username,
          role: 'operator'
        },
        reactions: []
      } as any);

      const result = await commentService.createComment(
        testSession.sessionId,
        testUser.id,
        'event',
        'evt-123',
        'Reply comment',
        undefined,
        'parent-1'
      );

      expect((result as any).parentId).toBe('parent-1');
    });
  });

  describe('editComment', () => {
    it('should edit comment by author', async () => {
      const existingComment = {
        id: 'comment-1',
        sessionId: 'session-1',
        authorId: testUser.id,
        content: 'Original content',
      };

      // Mock for editComment's initial call
      mockCommentRepo.getCommentWithAuthorById.mockResolvedValueOnce(
        existingComment as any
      );
      // Mock for canUserEditComment's internal call
      mockCommentRepo.getCommentWithAuthorById.mockResolvedValueOnce(
        existingComment as any
      );
      mockSessionManager.getParticipants.mockResolvedValueOnce([
        {
          id: 'part-1',
          sessionId: 'session-1',
          userId: testUser.id,
          role: 'operator' as const,
          joinedAt: new Date()
        }
      ]);
      mockCommentRepo.updateComment.mockResolvedValueOnce({
        ...existingComment,
        content: 'Updated content',
      } as any);

      const result = await commentService.editComment(
        'comment-1',
        'Updated content',
        testUser.id
      );

      expect(result.content).toBe('Updated content');
      expect(mockCommentRepo.updateComment).toHaveBeenCalledWith(
        'comment-1',
        expect.any(String),
        testUser.id
      );
    });

    it('should reject edit from non-author without operator role', async () => {
      const existingComment = {
        id: 'comment-1',
        sessionId: 'session-1',
        authorId: 'different-user',
        content: 'Original content',
        createdAt: new Date(),
        updatedAt: new Date(),
        isDeleted: false,
        parentId: null,
      };

      mockCommentRepo.getCommentWithAuthorById.mockResolvedValueOnce(
        existingComment as any
      );

      await expect(
        commentService.editComment('comment-1', 'Updated content', testUser.id)
      ).rejects.toThrow('does not have permission to edit');
    });

    it('should sanitize HTML in edited content', async () => {
      const existingComment = {
        id: 'comment-1',
        sessionId: 'session-1',
        authorId: testUser.id,
        content: 'Original content',
        createdAt: new Date(),
        updatedAt: new Date(),
        isDeleted: false,
        parentId: null,
      };

      // Mock for editComment's initial call
      mockCommentRepo.getCommentWithAuthorById.mockResolvedValueOnce(
        existingComment as any
      );
      // Mock for canUserEditComment's internal call
      mockCommentRepo.getCommentWithAuthorById.mockResolvedValueOnce(
        existingComment as any
      );
      mockSessionManager.getParticipants.mockResolvedValueOnce([
        {
          id: 'part-1',
          sessionId: 'session-1',
          userId: testUser.id,
          role: 'operator' as const,
          joinedAt: new Date()
        }
      ]);
      mockCommentRepo.updateComment.mockResolvedValueOnce({} as any);

      await commentService.editComment(
        'comment-1',
        '<script>alert("xss")</script>',
        testUser.id
      );

      const updateCall = mockCommentRepo.updateComment.mock.calls[0][1];
      expect(updateCall).not.toContain('<script>');
    });
  });

  describe('deleteComment', () => {
    it('should delete comment by author', async () => {
      const existingComment = {
        id: 'comment-1',
        authorId: testUser.id,
      };

      mockCommentRepo.getCommentWithAuthorById.mockResolvedValueOnce(
        existingComment as any
      );
      mockCommentRepo.deleteComment.mockResolvedValueOnce(undefined);

      await commentService.deleteComment('comment-1', testUser.id);

      expect(mockCommentRepo.deleteComment).toHaveBeenCalledWith('comment-1');
    });

    it('should reject delete from non-author', async () => {
      const existingComment = {
        id: 'comment-1',
        sessionId: 'session-1',
        authorId: 'different-user',
      };

      // Mock for canUserDeleteComment's internal call
      mockCommentRepo.getCommentWithAuthorById.mockResolvedValueOnce(
        existingComment as any
      );
      mockSessionManager.getParticipants.mockResolvedValueOnce([
        {
          id: 'part-1',
          sessionId: 'session-1',
          userId: testUser.id,
          role: 'viewer' as const,
          joinedAt: new Date()
        }
      ]);

      await expect(
        commentService.deleteComment('comment-1', testUser.id)
      ).rejects.toThrow('does not have permission to delete');
    });
  });

  describe('reactToComment', () => {
    it('should add reaction to comment', async () => {
      const comment = {
        id: 'comment-1',
        sessionId: testSession.sessionId,
      };

      const reaction = {
        id: 'reaction-1',
        commentId: 'comment-1',
        userId: testUser.id,
        username: testUser.username,
        reactionType: 'like' as const,
        createdAt: new Date(),
      };

      mockCommentRepo.getCommentWithAuthorById.mockResolvedValueOnce(
        comment as any
      );
      mockSessionManager.getParticipants.mockResolvedValueOnce([
        {
          id: 'part-1',
          sessionId: testSession.sessionId,
          userId: testUser.id,
          role: 'operator' as const,
          joinedAt: new Date()
        }
      ]);
      mockSessionManager.isParticipant.mockResolvedValueOnce(true);
      mockCommentRepo.toggleReaction.mockResolvedValueOnce(reaction);

      const result = await commentService.reactToComment(
        'comment-1',
        testUser.id,
        'like'
      );

      expect(result).toEqual(reaction);
      expect(mockCommentRepo.toggleReaction).toHaveBeenCalledWith(
        'comment-1',
        testUser.id,
        'like'
      );
    });

    it('should remove reaction if already exists (toggle)', async () => {
      const comment = {
        id: 'comment-1',
        sessionId: testSession.sessionId,
      };

      mockCommentRepo.getCommentWithAuthorById.mockResolvedValueOnce(
        comment as any
      );
      mockSessionManager.getParticipants.mockResolvedValueOnce([
        {
          id: 'part-1',
          sessionId: testSession.sessionId,
          userId: testUser.id,
          role: 'operator' as const,
          joinedAt: new Date()
        }
      ]);
      mockSessionManager.isParticipant.mockResolvedValueOnce(true);
      mockCommentRepo.toggleReaction.mockResolvedValueOnce(null); // null means removed

      const result = await commentService.reactToComment(
        'comment-1',
        testUser.id,
        'like'
      );

      expect(result).toBeNull();
    });

    it('should reject reaction from non-participant', async () => {
      const comment = {
        id: 'comment-1',
        sessionId: testSession.sessionId,
      };

      mockCommentRepo.getCommentWithAuthorById.mockResolvedValueOnce(
        comment as any
      );
      mockSessionManager.getParticipants.mockResolvedValueOnce([]);
      mockSessionManager.isParticipant.mockResolvedValueOnce(false);

      await expect(
        commentService.reactToComment('comment-1', 'non-participant', 'like')
      ).rejects.toThrow('does not have permission to react');
    });

    it('should support all reaction types', async () => {
      const comment = {
        id: 'comment-1',
        sessionId: testSession.sessionId,
      };

      const reactionTypes = ['like', 'flag', 'resolve', 'question'] as const;

      for (const reactionType of reactionTypes) {
        mockCommentRepo.getCommentWithAuthorById.mockResolvedValueOnce(
          comment as any
        );
        mockSessionManager.getParticipants.mockResolvedValueOnce([
          {
            id: 'part-1',
            sessionId: testSession.sessionId,
            userId: testUser.id,
            role: 'operator' as const,
            joinedAt: new Date()
          }
        ]);
        mockSessionManager.isParticipant.mockResolvedValueOnce(true);
        mockCommentRepo.toggleReaction.mockResolvedValueOnce({
          id: `reaction-${reactionType}`,
          reactionType,
        } as any);

        const result = await commentService.reactToComment(
          'comment-1',
          testUser.id,
          reactionType
        );

        expect(result?.reactionType).toBe(reactionType);
      }
    });
  });

  describe('getComments', () => {
    it('should retrieve comments for a session', async () => {
      const mockComments = [
        { id: 'comment-1', content: 'Test 1' },
        { id: 'comment-2', content: 'Test 2' },
      ];

      mockSessionManager.getSession.mockResolvedValueOnce(testSession);
      mockSessionManager.getParticipants.mockResolvedValueOnce([
        {
          id: 'part-1',
          sessionId: testSession.sessionId,
          userId: testUser.id,
          role: 'operator' as const,
          joinedAt: new Date()
        }
      ]);
      mockSessionManager.isParticipant.mockResolvedValueOnce(true);
      mockCommentRepo.getComments.mockResolvedValueOnce(mockComments as any);

      const result = await commentService.getComments(
        testSession.sessionId,
        testUser.id
      );

      expect(result).toEqual(mockComments);
      expect(mockCommentRepo.getComments).toHaveBeenCalled();
    });

    it('should filter comments by eventId', async () => {
      mockSessionManager.getSession.mockResolvedValueOnce(testSession);
      mockSessionManager.getParticipants.mockResolvedValueOnce([
        {
          id: 'part-1',
          sessionId: testSession.sessionId,
          userId: testUser.id,
          role: 'operator' as const,
          joinedAt: new Date()
        }
      ]);
      mockSessionManager.isParticipant.mockResolvedValueOnce(true);
      mockCommentRepo.getComments.mockResolvedValueOnce([]);

      await commentService.getComments(testSession.sessionId, testUser.id, {
        eventId: 'evt-123',
      });

      expect(mockCommentRepo.getComments).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: 'evt-123',
        })
      );
    });

    it('should filter comments by targetType and targetId', async () => {
      mockSessionManager.getSession.mockResolvedValueOnce(testSession);
      mockSessionManager.getParticipants.mockResolvedValueOnce([
        {
          id: 'part-1',
          sessionId: testSession.sessionId,
          userId: testUser.id,
          role: 'operator' as const,
          joinedAt: new Date()
        }
      ]);
      mockSessionManager.isParticipant.mockResolvedValueOnce(true);
      mockCommentRepo.getComments.mockResolvedValueOnce([]);

      await commentService.getComments(testSession.sessionId, testUser.id, {
        targetType: 'finding',
        targetId: 'finding-456',
      });

      expect(mockCommentRepo.getComments).toHaveBeenCalledWith(
        expect.objectContaining({
          targetType: 'finding',
          targetId: 'finding-456',
        })
      );
    });

    it('should support pagination', async () => {
      mockSessionManager.getSession.mockResolvedValueOnce(testSession);
      mockSessionManager.getParticipants.mockResolvedValueOnce([
        {
          id: 'part-1',
          sessionId: testSession.sessionId,
          userId: testUser.id,
          role: 'operator' as const,
          joinedAt: new Date()
        }
      ]);
      mockSessionManager.isParticipant.mockResolvedValueOnce(true);
      mockCommentRepo.getComments.mockResolvedValueOnce([]);

      await commentService.getComments(testSession.sessionId, testUser.id, {
        limit: 10,
        offset: 20,
      });

      expect(mockCommentRepo.getComments).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 10,
          offset: 20,
        })
      );
    });

    it('should reject unauthorized user', async () => {
      mockSessionManager.getSession.mockResolvedValueOnce(testSession);
      mockSessionManager.getParticipants.mockResolvedValueOnce([]);
      mockSessionManager.isParticipant.mockResolvedValueOnce(false);

      await expect(
        commentService.getComments(testSession.sessionId, 'unauthorized-user')
      ).rejects.toThrow('does not have permission to view comments');
    });
  });

  describe('edge cases', () => {
    it('should handle empty comment content', async () => {
      mockSessionManager.getSession.mockResolvedValueOnce(testSession);
      mockSessionManager.getParticipants.mockResolvedValueOnce([
        {
          id: 'part-1',
          sessionId: testSession.sessionId,
          userId: testUser.id,
          role: 'operator' as const,
          joinedAt: new Date()
        }
      ]);
      mockSessionManager.isParticipant.mockResolvedValueOnce(true);

      // Empty content might be rejected
      await expect(
        commentService.createComment(
          testSession.sessionId,
          testUser.id,
          'event',
          'evt-123',
          ''
        )
      ).rejects.toThrow();
    });

    it('should handle very long comment content', async () => {
      const longContent = 'a'.repeat(10000);

      mockSessionManager.getSession.mockResolvedValueOnce(testSession);
      mockSessionManager.getParticipants.mockResolvedValueOnce([
        {
          id: 'part-1',
          sessionId: testSession.sessionId,
          userId: testUser.id,
          role: 'operator' as const,
          joinedAt: new Date()
        }
      ]);
      mockSessionManager.isParticipant.mockResolvedValueOnce(true);
      mockCommentRepo.createComment.mockResolvedValueOnce({
        id: 'comment-1',
        content: longContent,
      } as any);

      const result = await commentService.createComment(
        testSession.sessionId,
        testUser.id,
        'event',
        'evt-123',
        longContent
      );

      expect(result).toBeDefined();
    });

    it('should handle concurrent comment creation', async () => {
      mockSessionManager.getSession.mockResolvedValue(testSession);
      mockSessionManager.getParticipants.mockResolvedValue([
        {
          id: 'part-1',
          sessionId: testSession.sessionId,
          userId: testUser.id,
          role: 'operator' as const,
          joinedAt: new Date()
        }
      ]);
      mockSessionManager.isParticipant.mockResolvedValue(true);
      mockCommentRepo.createComment.mockResolvedValue({
        id: 'comment-1',
      } as any);

      // Create multiple comments concurrently
      const promises = Array.from({ length: 5 }, (_, i) =>
        commentService.createComment(
          testSession.sessionId,
          testUser.id,
          'event',
          'evt-123',
          `Comment ${i}`
        )
      );

      const results = await Promise.all(promises);
      expect(results).toHaveLength(5);
    });
  });
});