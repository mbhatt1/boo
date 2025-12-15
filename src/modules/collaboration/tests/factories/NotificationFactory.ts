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
  userId?: string;
  fromUserId?: string;
  fromUsername?: string;
  message?: string;
  commentId?: string;
  sessionId?: string;
  isRead?: boolean;
  createdAt?: Date;
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
      userId: options.userId || generateUUID(),
      fromUserId: options.fromUserId || generateUUID(),
      fromUsername: options.fromUsername || `user${sequence}`,
      message: options.message || `Test notification ${sequence}`,
      commentId: options.commentId || generateUUID(),
      sessionId: options.sessionId || generateUUID(),
      isRead: options.isRead !== undefined ? options.isRead : false,
      createdAt: options.createdAt || new Date(),
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
      userId: recipientId,
      fromUserId: senderId,
      commentId: commentId,
      message: `You were mentioned in a comment`,
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
      userId: recipientId,
      fromUserId: senderId,
      commentId: commentId,
      message: `Someone replied to your comment`,
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
      userId: recipientId,
      fromUserId: senderId,
      commentId: commentId,
      message: `Someone reacted ${reaction} to your comment`,
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
      userId: recipientId,
      fromUserId: senderId,
      sessionId: sessionId,
      message: message,
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
      userId: recipientId,
      fromUserId: 'system',
      message: message,
    });
  }
  
  /**
   * Create an unread notification
   */
  static createUnread(options: NotificationFactoryOptions = {}): any {
    return this.create({
      ...options,
      isRead: false,
    });
  }
  
  /**
   * Create a read notification
   */
  static createRead(options: NotificationFactoryOptions = {}): any {
    return this.create({
      ...options,
      isRead: true,
    });
  }
  
  /**
   * Create an archived notification
   */
  static createArchived(options: NotificationFactoryOptions = {}): any {
    return this.create({
      ...options,
      isRead: true,
      createdAt: new Date(Date.now() - 86400000), // 1 day ago
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
      userId: userId,
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
      fromUserId: userId,
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
      userId: recipientId,
      isRead: false,
    });
    
    const read = this.createMany(readCount, {
      userId: recipientId,
      isRead: true,
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