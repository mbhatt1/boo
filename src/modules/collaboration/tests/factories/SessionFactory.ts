/**
 * Session Factory
 * 
 * Generate test session data
 */

import { generateUUID, generateSessionId, generatePaperId } from '../setup/test-helpers.js';

export interface SessionFactoryOptions {
  id?: string;
  operationId?: string;
  sessionId?: string;
  ownerId?: string;
  status?: 'active' | 'completed' | 'archived';
  target?: string;
  objective?: string;
  startTime?: Date;
  endTime?: Date;
  createdAt?: Date;
  updatedAt?: Date;
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
      operationId: options.operationId || `op_${sequence}`,
      sessionId: options.sessionId || generateSessionId(),
      ownerId: options.ownerId || generateUUID(),
      status: options.status || 'active',
      target: options.target,
      objective: options.objective,
      startTime: options.startTime || new Date(),
      endTime: options.endTime,
      createdAt: options.createdAt || new Date(),
      updatedAt: options.updatedAt || new Date(),
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
    return this.create({ ...options, status: 'active', endTime: undefined });
  }
  
  /**
   * Create a completed session
   */
  static createCompleted(options: SessionFactoryOptions = {}): any {
    return this.create({
      ...options,
      status: 'completed',
      endTime: options.endTime || new Date(),
    });
  }
  
  /**
   * Create an archived session
   */
  static createArchived(options: SessionFactoryOptions = {}): any {
    return this.create({
      ...options,
      status: 'archived',
      endTime: options.endTime || new Date(),
    });
  }
  
  /**
   * Create a session for a specific operation
   */
  static createForOperation(operationId: string, options: SessionFactoryOptions = {}): any {
    return this.create({ ...options, operationId });
  }
  
  /**
   * Create a session by a specific owner
   */
  static createByOwner(ownerId: string, options: SessionFactoryOptions = {}): any {
    return this.create({ ...options, ownerId });
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