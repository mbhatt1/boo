/**
 * Event Store Service - Buffer and persist operation events
 * 
 * Provides in-memory buffering of recent events with Redis-backed
 * persistence for event replay and historical access. Automatically
 * cleans up old events based on retention policy.
 */

import type { OperationEvent } from '../types/index.js';
import type { RedisClient } from '../redis/RedisClient.js';

/**
 * Event query options for filtering and pagination
 */
export interface EventQueryOptions {
  /**
   * Operation ID to filter by
   */
  operationId?: string;
  
  /**
   * Event types to include
   */
  types?: string[];
  
  /**
   * Start timestamp (inclusive)
   */
  startTime?: number;
  
  /**
   * End timestamp (inclusive)
   */
  endTime?: number;
  
  /**
   * Maximum number of events to return
   */
  limit?: number;
  
  /**
   * Offset for pagination
   */
  offset?: number;
  
  /**
   * Sort order ('asc' or 'desc')
   */
  order?: 'asc' | 'desc';
}

/**
 * Event store configuration
 */
export interface EventStoreConfig {
  /**
   * Maximum events to keep in memory per operation
   */
  maxEventsPerOperation: number;
  
  /**
   * Event retention period in hours
   */
  retentionHours: number;
  
  /**
   * Redis client for persistence
   */
  redis: RedisClient;
  
  /**
   * Cleanup interval in milliseconds
   */
  cleanupIntervalMs?: number;
}

/**
 * In-memory event buffer for fast access
 */
class EventBuffer {
  private events: Map<string, OperationEvent[]>;
  private maxSize: number;
  
  constructor(maxSize: number) {
    this.events = new Map();
    this.maxSize = maxSize;
  }
  
  /**
   * Add an event to the buffer
   */
  add(operationId: string, event: OperationEvent): void {
    let operationEvents = this.events.get(operationId);
    if (!operationEvents) {
      operationEvents = [];
      this.events.set(operationId, operationEvents);
    }
    
    operationEvents.push(event);
    
    // Trim to max size (keep most recent)
    if (operationEvents.length > this.maxSize) {
      operationEvents.shift();
    }
  }
  
  /**
   * Get events for an operation
   */
  get(operationId: string, limit?: number): OperationEvent[] {
    const events = this.events.get(operationId) || [];
    if (limit) {
      return events.slice(-limit);
    }
    return [...events];
  }
  
  /**
   * Get all buffered operation IDs
   */
  getOperationIds(): string[] {
    return Array.from(this.events.keys());
  }
  
  /**
   * Clear events for an operation
   */
  clear(operationId: string): void {
    this.events.delete(operationId);
  }
  
  /**
   * Clear all events
   */
  clearAll(): void {
    this.events.clear();
  }
  
  /**
   * Get buffer statistics
   */
  getStats(): {
    operationCount: number;
    totalEvents: number;
  } {
    let totalEvents = 0;
    for (const events of this.events.values()) {
      totalEvents += events.length;
    }
    return {
      operationCount: this.events.size,
      totalEvents,
    };
  }
}

/**
 * Event Store - Manage operation events with memory and Redis persistence
 */
export class EventStore {
  private buffer: EventBuffer;
  private redis: RedisClient;
  private config: EventStoreConfig;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  
  constructor(config: EventStoreConfig) {
    this.config = config;
    this.buffer = new EventBuffer(config.maxEventsPerOperation);
    this.redis = config.redis;
    
    // Start periodic cleanup
    this.startCleanup();
  }
  
  /**
   * Store an event (both in-memory and Redis)
   */
  async storeEvent(event: OperationEvent): Promise<void> {
    // Add to in-memory buffer
    this.buffer.add(event.operationId, event);
    
    // Persist to Redis
    await this.persistEvent(event);
  }
  
  /**
   * Store multiple events in batch
   */
  async storeEvents(events: OperationEvent[]): Promise<void> {
    // Add all to buffer
    for (const event of events) {
      this.buffer.add(event.operationId, event);
    }
    
    // Batch persist to Redis
    await this.persistEvents(events);
  }
  
  /**
   * Get events for an operation (from buffer first, then Redis)
   */
  async getEvents(operationId: string, options: EventQueryOptions = {}): Promise<OperationEvent[]> {
    const limit = options.limit || 100;
    const offset = options.offset || 0;
    
    // Try buffer first for recent events
    const bufferEvents = this.buffer.get(operationId);
    
    // If buffer has enough events, return from buffer
    if (bufferEvents.length >= limit + offset) {
      return this.filterEvents(bufferEvents, options);
    }
    
    // Otherwise, fetch from Redis
    const redisEvents = await this.fetchFromRedis(operationId, options);
    
    // Merge with buffer (buffer events are more recent)
    const allEvents = [...redisEvents, ...bufferEvents];
    
    // Remove duplicates (prefer buffer version)
    const uniqueEvents = this.deduplicateEvents(allEvents);
    
    return this.filterEvents(uniqueEvents, options);
  }
  
  /**
   * Get recent events across all operations
   */
  async getRecentEvents(limit: number = 100): Promise<OperationEvent[]> {
    const allEvents: OperationEvent[] = [];
    
    // Collect from all operation buffers
    for (const operationId of this.buffer.getOperationIds()) {
      const events = this.buffer.get(operationId);
      allEvents.push(...events);
    }
    
    // Sort by timestamp (most recent first)
    allEvents.sort((a, b) => b.timestamp - a.timestamp);
    
    return allEvents.slice(0, limit);
  }
  
  /**
   * Clear events for an operation
   */
  async clearOperation(operationId: string): Promise<void> {
    // Clear from buffer
    this.buffer.clear(operationId);
    
    // Clear from Redis
    await this.redis.del(this.getRedisKey(operationId));
  }
  
  /**
   * Get event store statistics
   */
  getStats(): {
    buffer: {
      operationCount: number;
      totalEvents: number;
    };
    config: {
      maxEventsPerOperation: number;
      retentionHours: number;
    };
  } {
    return {
      buffer: this.buffer.getStats(),
      config: {
        maxEventsPerOperation: this.config.maxEventsPerOperation,
        retentionHours: this.config.retentionHours,
      },
    };
  }
  
  /**
   * Replay events for an operation (ordered by timestamp)
   */
  async replayEvents(operationId: string, options: EventQueryOptions = {}): Promise<OperationEvent[]> {
    const events = await this.getEvents(operationId, {
      ...options,
      order: 'asc',
    });
    return events;
  }
  
  /**
   * Search events by content
   */
  async searchEvents(query: string, options: EventQueryOptions = {}): Promise<OperationEvent[]> {
    const operationId = options.operationId;
    const events = operationId
      ? await this.getEvents(operationId, options)
      : await this.getRecentEvents(1000);
    
    // Simple text search in event content
    const lowerQuery = query.toLowerCase();
    return events.filter(event =>
      event.content.toLowerCase().includes(lowerQuery)
    );
  }
  
  /**
   * Cleanup expired events
   */
  async cleanup(): Promise<number> {
    const expirationTime = Date.now() - (this.config.retentionHours * 60 * 60 * 1000);
    let removedCount = 0;
    
    // Get all operation keys from Redis
    const pattern = `events:*`;
    const keys = await this.redis.keys(pattern);
    
    for (const key of keys) {
      const events = await this.fetchEventsFromKey(key);
      const validEvents = events.filter(e => e.timestamp >= expirationTime);
      
      if (validEvents.length === 0) {
        // All events expired, delete key
        await this.redis.del(key);
        removedCount += events.length;
      } else if (validEvents.length < events.length) {
        // Some events expired, update key
        await this.redis.set(key, JSON.stringify(validEvents));
        removedCount += events.length - validEvents.length;
      }
    }
    
    return removedCount;
  }
  
  /**
   * Destroy the event store and cleanup resources
   */
  destroy(): void {
    this.stopCleanup();
    this.buffer.clearAll();
  }
  
  // Private methods
  
  /**
   * Persist a single event to Redis
   */
  private async persistEvent(event: OperationEvent): Promise<void> {
    const key = this.getRedisKey(event.operationId);
    
    // Get existing events
    const existing = await this.fetchEventsFromKey(key);
    existing.push(event);
    
    // Keep only recent events (based on max size)
    const recent = existing.slice(-this.config.maxEventsPerOperation * 2);
    
    // Store back to Redis with TTL
    const ttl = this.config.retentionHours * 60 * 60;
    await this.redis.set(key, JSON.stringify(recent), ttl);
  }
  
  /**
   * Persist multiple events to Redis in batch
   */
  private async persistEvents(events: OperationEvent[]): Promise<void> {
    // Group events by operation
    const byOperation = new Map<string, OperationEvent[]>();
    for (const event of events) {
      const existing = byOperation.get(event.operationId) || [];
      existing.push(event);
      byOperation.set(event.operationId, existing);
    }
    
    // Store each operation's events
    const promises: Promise<void>[] = [];
    for (const [operationId, opEvents] of byOperation.entries()) {
      const key = this.getRedisKey(operationId);
      
      promises.push(
        (async () => {
          const existing = await this.fetchEventsFromKey(key);
          existing.push(...opEvents);
          const recent = existing.slice(-this.config.maxEventsPerOperation * 2);
          const ttl = this.config.retentionHours * 60 * 60;
          await this.redis.set(key, JSON.stringify(recent), ttl);
        })()
      );
    }
    
    await Promise.all(promises);
  }
  
  /**
   * Fetch events from Redis
   */
  private async fetchFromRedis(operationId: string, options: EventQueryOptions): Promise<OperationEvent[]> {
    const key = this.getRedisKey(operationId);
    const events = await this.fetchEventsFromKey(key);
    return this.filterEvents(events, options);
  }
  
  /**
   * Fetch events from a Redis key
   */
  private async fetchEventsFromKey(key: string): Promise<OperationEvent[]> {
    const data = await this.redis.get(key);
    if (!data) {
      return [];
    }
    
    try {
      return JSON.parse(data) as OperationEvent[];
    } catch (error) {
      console.error(`Failed to parse events from Redis key ${key}:`, error);
      return [];
    }
  }
  
  /**
   * Filter events based on query options
   */
  private filterEvents(events: OperationEvent[], options: EventQueryOptions): OperationEvent[] {
    let filtered = events;
    
    // Filter by types
    if (options.types && options.types.length > 0) {
      filtered = filtered.filter(e => options.types!.includes(e.type));
    }
    
    // Filter by time range
    if (options.startTime) {
      filtered = filtered.filter(e => e.timestamp >= options.startTime!);
    }
    if (options.endTime) {
      filtered = filtered.filter(e => e.timestamp <= options.endTime!);
    }
    
    // Sort
    const order = options.order || 'desc';
    filtered.sort((a, b) => {
      return order === 'asc'
        ? a.timestamp - b.timestamp
        : b.timestamp - a.timestamp;
    });
    
    // Paginate
    const offset = options.offset || 0;
    const limit = options.limit || 100;
    return filtered.slice(offset, offset + limit);
  }
  
  /**
   * Remove duplicate events (prefer more recent)
   */
  private deduplicateEvents(events: OperationEvent[]): OperationEvent[] {
    const seen = new Map<string, OperationEvent>();
    
    // Process in reverse order (most recent first)
    for (let i = events.length - 1; i >= 0; i--) {
      const event = events[i];
      if (!seen.has(event.id)) {
        seen.set(event.id, event);
      }
    }
    
    return Array.from(seen.values());
  }
  
  /**
   * Get Redis key for an operation
   */
  private getRedisKey(operationId: string): string {
    return `events:${operationId}`;
  }
  
  /**
   * Start periodic cleanup
   */
  private startCleanup(): void {
    const intervalMs = this.config.cleanupIntervalMs || 3600000; // 1 hour default
    this.cleanupInterval = setInterval(() => {
      this.cleanup().catch(error => {
        console.error('Event store cleanup failed:', error);
      });
    }, intervalMs);
  }
  
  /**
   * Stop periodic cleanup
   */
  private stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

/**
 * Create a new event store
 */
export function createEventStore(config: EventStoreConfig): EventStore {
  return new EventStore(config);
}

export default EventStore;