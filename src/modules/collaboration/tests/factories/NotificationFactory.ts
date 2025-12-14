/**
 * Notification Factory
 * 
 * Generate test notification data
 */

import { generateUUID } from '../setup/test-helpers.js';

export type NotificationType = 'mention' | 'reply' | 'reaction' | 'session' | 'system';

export interface NotificationFactoryOptions {
  id?: string;
  type?: NotificationType;
  recipient_id?: string;
  sender_id?: string;
  content?: string;
  comment_id?: string | null;
  session_id?: string | null;
  status?: 'unread' | 'read' | 'archived';
  created_at?: Date;
  read_at?: Date | null;
  metadata?: Record<string, any>;
}

export class NotificationFactory {
  private static sequenceCounter = 1;
  
  /**
   * Create a single notification with optional overrides
   */
  static create(options: NotificationFactoryOptions = {}): any {
    const sequence = this.sequenceCounter++;
    
    return {
      id: options.id || generateUUID(),
      type: options.type || 'mention',
      recipient_id: options.recipient_id || generateUUID(),
      sender_id: options.sender_id || generateUUID(),
      content: options.content || `Test notification ${sequence}`,
      comment_id: options.comment_id === undefined ? null : options.comment_id,
      session_id: options.session_id === undefined ? null : options.session_id,
      status: options.status || 'unread',
      created_at: options.created_at || new Date(),
      read_at: options.read_at === undefined ? null : options.read_at,
      metadata: options.metadata || {},
    };
  }
  
  /**
   * Create multiple notifications
   */
  static createMany(count: number, options: NotificationFactoryOptions = {}): any[] {
    return Array.from({ length: count }, () => this.create(options));
  }
  
  /**
   * Create a mention notification
   */
  static createMention(
    recipientId: string,
    senderId: string,
    commentId: string,
    options: NotificationFactoryOptions = {}
  ): any {
    return this.create({
      ...options,
      type: 'mention',
      recipient_id: recipientId,
      sender_id: senderId,
      comment_id: commentId,
      content: `You were mentioned in a comment`,
    });
  }
  
  /**
   * Create a reply notification
   */
  static createReply(
    recipientId: string,
    senderId: string,
    commentId: string,
    options: NotificationFactoryOptions = {}
  ): any {
    return this.create({
      ...options,
      type: 'reply',
      recipient_id: recipientId,
      sender_id: senderId,
      comment_id: commentId,
      content: `Someone replied to your comment`,
    });
  }
  
  /**
   * Create a reaction notification
   */
  static createReaction(
    recipientId: string,
    senderId: string,
    commentId: string,
    reaction: string,
    options: NotificationFactoryOptions = {}
  ): any {
    return this.create({
      ...options,
      type: 'reaction',
      recipient_id: recipientId,
      sender_id: senderId,
      comment_id: commentId,
      content: `Someone reacted ${reaction} to your comment`,
      metadata: { reaction },
    });
  }
  
  /**
   * Create a session notification
   */
  static createSession(
    recipientId: string,
    senderId: string,
    sessionId: string,
    message: string,
    options: NotificationFactoryOptions = {}
  ): any {
    return this.create({
      ...options,
      type: 'session',
      recipient_id: recipientId,
      sender_id: senderId,
      session_id: sessionId,
      content: message,
    });
  }
  
  /**
   * Create a system notification
   */
  static createSystem(
    recipientId: string,
    message: string,
    options: NotificationFactoryOptions = {}
  ): any {
    return this.create({
      ...options,
      type: 'system',
      recipient_id: recipientId,
      sender_id: undefined,
      content: message,
    });
  }
  
  /**
   * Create an unread notification
   */
  static createUnread(options: NotificationFactoryOptions = {}): any {
    return this.create({
      ...options,
      status: 'unread',
      read_at: null,
    });
  }
  
  /**
   * Create a read notification
   */
  static createRead(options: NotificationFactoryOptions = {}): any {
    return this.create({
      ...options,
      status: 'read',
      read_at: new Date(),
    });
  }
  
  /**
   * Create an archived notification
   */
  static createArchived(options: NotificationFactoryOptions = {}): any {
    return this.create({
      ...options,
      status: 'archived',
      read_at: new Date(Date.now() - 86400000), // 1 day ago
    });
  }
  
  /**
   * Create notifications for a user
   */
  static createForUser(
    userId: string,
    count: number,
    options: NotificationFactoryOptions = {}
  ): any[] {
    return this.createMany(count, {
      ...options,
      recipient_id: userId,
    });
  }
  
  /**
   * Create notifications from a user
   */
  static createFromUser(
    userId: string,
    count: number,
    options: NotificationFactoryOptions = {}
  ): any[] {
    return this.createMany(count, {
      ...options,
      sender_id: userId,
    });
  }
  
  /**
   * Create a mix of read and unread notifications
   */
  static createMixed(
    recipientId: string,
    unreadCount: number,
    readCount: number
  ): any[] {
    const unread = this.createMany(unreadCount, {
      recipient_id: recipientId,
      status: 'unread',
      read_at: null,
    });
    
    const read = this.createMany(readCount, {
      recipient_id: recipientId,
      status: 'read',
      read_at: new Date(),
    });
    
    return [...unread, ...read];
  }
  
  /**
   * Reset sequence counter
   */
  static reset(): void {
    this.sequenceCounter = 1;
  }
}