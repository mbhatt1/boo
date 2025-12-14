/**
 * Event Factory
 * 
 * Generate test event data
 */

import { generateUUID } from '../setup/test-helpers.js';

export type EventType = 
  | 'session:created'
  | 'session:joined'
  | 'session:left'
  | 'session:updated'
  | 'session:ended'
  | 'comment:created'
  | 'comment:updated'
  | 'comment:deleted'
  | 'comment:reacted'
  | 'presence:updated'
  | 'user:mentioned'
  | 'notification:sent';

export interface EventFactoryOptions {
  id?: string;
  type?: EventType;
  user_id?: string;
  session_id?: string;
  data?: Record<string, any>;
  timestamp?: Date;
  metadata?: Record<string, any>;
}

export class EventFactory {
  private static sequenceCounter = 1;
  
  /**
   * Create a single event with optional overrides
   */
  static create(options: EventFactoryOptions = {}): any {
    const sequence = this.sequenceCounter++;
    
    return {
      id: options.id || generateUUID(),
      type: options.type || 'session:joined',
      user_id: options.user_id || generateUUID(),
      session_id: options.session_id || generateUUID(),
      data: options.data || {},
      timestamp: options.timestamp || new Date(),
      metadata: options.metadata || {},
    };
  }
  
  /**
   * Create multiple events
   */
  static createMany(count: number, options: EventFactoryOptions = {}): any[] {
    return Array.from({ length: count }, () => this.create(options));
  }
  
  /**
   * Create a session created event
   */
  static createSessionCreated(
    userId: string,
    sessionId: string,
    options: EventFactoryOptions = {}
  ): any {
    return this.create({
      ...options,
      type: 'session:created',
      user_id: userId,
      session_id: sessionId,
      data: {
        title: 'Test Session',
        paper_id: 'paper_001',
        ...options.data,
      },
    });
  }
  
  /**
   * Create a session joined event
   */
  static createSessionJoined(
    userId: string,
    sessionId: string,
    options: EventFactoryOptions = {}
  ): any {
    return this.create({
      ...options,
      type: 'session:joined',
      user_id: userId,
      session_id: sessionId,
    });
  }
  
  /**
   * Create a session left event
   */
  static createSessionLeft(
    userId: string,
    sessionId: string,
    options: EventFactoryOptions = {}
  ): any {
    return this.create({
      ...options,
      type: 'session:left',
      user_id: userId,
      session_id: sessionId,
    });
  }
  
  /**
   * Create a comment created event
   */
  static createCommentCreated(
    userId: string,
    sessionId: string,
    commentId: string,
    options: EventFactoryOptions = {}
  ): any {
    return this.create({
      ...options,
      type: 'comment:created',
      user_id: userId,
      session_id: sessionId,
      data: {
        comment_id: commentId,
        content: 'Test comment',
        ...options.data,
      },
    });
  }
  
  /**
   * Create a comment updated event
   */
  static createCommentUpdated(
    userId: string,
    sessionId: string,
    commentId: string,
    options: EventFactoryOptions = {}
  ): any {
    return this.create({
      ...options,
      type: 'comment:updated',
      user_id: userId,
      session_id: sessionId,
      data: {
        comment_id: commentId,
        ...options.data,
      },
    });
  }
  
  /**
   * Create a comment deleted event
   */
  static createCommentDeleted(
    userId: string,
    sessionId: string,
    commentId: string,
    options: EventFactoryOptions = {}
  ): any {
    return this.create({
      ...options,
      type: 'comment:deleted',
      user_id: userId,
      session_id: sessionId,
      data: {
        comment_id: commentId,
        ...options.data,
      },
    });
  }
  
  /**
   * Create a presence updated event
   */
  static createPresenceUpdated(
    userId: string,
    status: string,
    options: EventFactoryOptions = {}
  ): any {
    return this.create({
      ...options,
      type: 'presence:updated',
      user_id: userId,
      data: {
        status,
        ...options.data,
      },
    });
  }
  
  /**
   * Create a user mentioned event
   */
  static createUserMentioned(
    mentionedUserId: string,
    mentioningUserId: string,
    sessionId: string,
    commentId: string,
    options: EventFactoryOptions = {}
  ): any {
    return this.create({
      ...options,
      type: 'user:mentioned',
      user_id: mentionedUserId,
      session_id: sessionId,
      data: {
        mentioned_by: mentioningUserId,
        comment_id: commentId,
        ...options.data,
      },
    });
  }
  
  /**
   * Create events for a session timeline
   */
  static createSessionTimeline(
    sessionId: string,
    userIds: string[]
  ): any[] {
    const events: any[] = [];
    
    // Session created
    events.push(this.createSessionCreated(userIds[0], sessionId));
    
    // Users join
    userIds.forEach((userId, index) => {
      setTimeout(() => {
        events.push(this.createSessionJoined(userId, sessionId));
      }, index * 100);
    });
    
    // Some comments
    for (let i = 0; i < 3; i++) {
      const userId = userIds[i % userIds.length];
      events.push(
        this.createCommentCreated(
          userId,
          sessionId,
          generateUUID()
        )
      );
    }
    
    return events;
  }
  
  /**
   * Create events with sequential timestamps
   */
  static createSequential(
    count: number,
    intervalMs: number,
    options: EventFactoryOptions = {}
  ): any[] {
    const baseTime = options.timestamp || new Date();
    
    return Array.from({ length: count }, (_, i) => {
      return this.create({
        ...options,
        timestamp: new Date(baseTime.getTime() + i * intervalMs),
      });
    });
  }
  
  /**
   * Reset sequence counter
   */
  static reset(): void {
    this.sequenceCounter = 1;
  }
}