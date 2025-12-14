/**
 * Comment Factory
 * 
 * Generate test comment data
 */

import { generateUUID, generateRandomString } from '../setup/test-helpers.js';

export interface CommentFactoryOptions {
  id?: string;
  content?: string;
  author_id?: string;
  session_id?: string;
  parent_comment_id?: string | null;
  status?: 'active' | 'edited' | 'deleted';
  created_at?: Date;
  updated_at?: Date;
  deleted_at?: Date | null;
  metadata?: Record<string, any>;
  reactions?: Record<string, string[]>;
}

export class CommentFactory {
  private static sequenceCounter = 1;
  
  /**
   * Create a single comment with optional overrides
   */
  static create(options: CommentFactoryOptions = {}): any {
    const sequence = this.sequenceCounter++;
    
    return {
      id: options.id || generateUUID(),
      content: options.content || `Test comment ${sequence}`,
      author_id: options.author_id || generateUUID(),
      session_id: options.session_id || generateUUID(),
      parent_comment_id: options.parent_comment_id === undefined ? null : options.parent_comment_id,
      status: options.status || 'active',
      created_at: options.created_at || new Date(),
      updated_at: options.updated_at || new Date(),
      deleted_at: options.deleted_at === undefined ? null : options.deleted_at,
      metadata: options.metadata || {},
      reactions: options.reactions || {},
    };
  }
  
  /**
   * Create multiple comments
   */
  static createMany(count: number, options: CommentFactoryOptions = {}): any[] {
    return Array.from({ length: count }, () => this.create(options));
  }
  
  /**
   * Create a root comment (no parent)
   */
  static createRoot(options: CommentFactoryOptions = {}): any {
    return this.create({ ...options, parent_comment_id: null });
  }
  
  /**
   * Create a reply to another comment
   */
  static createReply(parentId: string, options: CommentFactoryOptions = {}): any {
    return this.create({ ...options, parent_comment_id: parentId });
  }
  
  /**
   * Create a thread of comments
   */
  static createThread(depth: number, options: CommentFactoryOptions = {}): any[] {
    const comments: any[] = [];
    let parentId: string | null = null;
    
    for (let i = 0; i < depth; i++) {
      const comment = this.create({
        ...options,
        parent_comment_id: parentId,
      });
      comments.push(comment);
      parentId = comment.id;
    }
    
    return comments;
  }
  
  /**
   * Create an edited comment
   */
  static createEdited(options: CommentFactoryOptions = {}): any {
    return this.create({
      ...options,
      status: 'edited',
      updated_at: new Date(Date.now() + 1000),
    });
  }
  
  /**
   * Create a deleted comment
   */
  static createDeleted(options: CommentFactoryOptions = {}): any {
    return this.create({
      ...options,
      status: 'deleted',
      deleted_at: new Date(),
    });
  }
  
  /**
   * Create a comment with mentions
   */
  static createWithMentions(userIds: string[], options: CommentFactoryOptions = {}): any {
    const mentions = userIds.map(id => `@${id.substring(0, 8)}`).join(' ');
    const content = options.content || `Test comment with mentions: ${mentions}`;
    
    return this.create({
      ...options,
      content,
      metadata: {
        ...options.metadata,
        mentions: userIds,
      },
    });
  }
  
  /**
   * Create a comment with reactions
   */
  static createWithReactions(
    reactions: Record<string, string[]>,
    options: CommentFactoryOptions = {}
  ): any {
    return this.create({ ...options, reactions });
  }
  
  /**
   * Create a long comment
   */
  static createLong(length: number = 1000, options: CommentFactoryOptions = {}): any {
    return this.create({
      ...options,
      content: generateRandomString(length),
    });
  }
  
  /**
   * Create comments for a session
   */
  static createForSession(
    sessionId: string,
    count: number,
    options: CommentFactoryOptions = {}
  ): any[] {
    return this.createMany(count, { ...options, session_id: sessionId });
  }
  
  /**
   * Create comments by a user
   */
  static createByUser(
    userId: string,
    count: number,
    options: CommentFactoryOptions = {}
  ): any[] {
    return this.createMany(count, { ...options, author_id: userId });
  }
  
  /**
   * Reset sequence counter
   */
  static reset(): void {
    this.sequenceCounter = 1;
  }
}