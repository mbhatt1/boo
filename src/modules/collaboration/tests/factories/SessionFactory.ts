/**
 * Session Factory
 * 
 * Generate test session data
 */

import { generateUUID, generateSessionId, generatePaperId } from '../setup/test-helpers.js';

export interface SessionFactoryOptions {
  id?: string;
  paper_id?: string;
  title?: string;
  created_by?: string;
  status?: 'active' | 'completed' | 'archived';
  created_at?: Date;
  updated_at?: Date;
  ended_at?: Date | null;
  metadata?: Record<string, any>;
}

export class SessionFactory {
  private static sequenceCounter = 1;
  
  /**
   * Create a single session with optional overrides
   */
  static create(options: SessionFactoryOptions = {}): any {
    const sequence = this.sequenceCounter++;
    
    return {
      id: options.id || generateUUID(),
      paper_id: options.paper_id || generatePaperId(),
      title: options.title || `Test Session ${sequence}`,
      created_by: options.created_by || generateUUID(),
      status: options.status || 'active',
      created_at: options.created_at || new Date(),
      updated_at: options.updated_at || new Date(),
      ended_at: options.ended_at === undefined ? null : options.ended_at,
      metadata: options.metadata || {},
    };
  }
  
  /**
   * Create multiple sessions
   */
  static createMany(count: number, options: SessionFactoryOptions = {}): any[] {
    return Array.from({ length: count }, () => this.create(options));
  }
  
  /**
   * Create an active session
   */
  static createActive(options: SessionFactoryOptions = {}): any {
    return this.create({ ...options, status: 'active', ended_at: null });
  }
  
  /**
   * Create a completed session
   */
  static createCompleted(options: SessionFactoryOptions = {}): any {
    return this.create({
      ...options,
      status: 'completed',
      ended_at: options.ended_at || new Date(),
    });
  }
  
  /**
   * Create an archived session
   */
  static createArchived(options: SessionFactoryOptions = {}): any {
    return this.create({
      ...options,
      status: 'archived',
      ended_at: options.ended_at || new Date(),
    });
  }
  
  /**
   * Create a session for a specific paper
   */
  static createForPaper(paperId: string, options: SessionFactoryOptions = {}): any {
    return this.create({ ...options, paper_id: paperId });
  }
  
  /**
   * Create a session by a specific user
   */
  static createByUser(userId: string, options: SessionFactoryOptions = {}): any {
    return this.create({ ...options, created_by: userId });
  }
  
  /**
   * Create a session with metadata
   */
  static createWithMetadata(
    metadata: Record<string, any>,
    options: SessionFactoryOptions = {}
  ): any {
    return this.create({ ...options, metadata });
  }
  
  /**
   * Reset sequence counter
   */
  static reset(): void {
    this.sequenceCounter = 1;
  }
}