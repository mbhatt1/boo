/**
 * EventStore Tests
 * 
 * Comprehensive tests for event storage and retrieval, including:
 * - Storing events (single and batch)
 * - Getting events with filtering and pagination
 * - Event replay functionality
 * - Search events by content
 * - Cleanup of expired events
 * - In-memory buffer management
 * - Redis persistence
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { EventStore, EventStoreConfig, EventQueryOptions } from '../../services/EventStore.js';
import { RedisClient } from '../../redis/RedisClient.js';
import { OperationEvent } from '../../types/index.js';
import { generateUUID } from '../setup/test-helpers.js';

// Mock RedisClient
class MockRedisClient {
  private store: Map<string, string> = new Map();
  private ttls: Map<string, number> = new Map();
  
  async get(key: string): Promise<string | null> {
    return this.store.get(key) || null;
  }
  
  async set(key: string, value: string, ttl?: number): Promise<void> {
    this.store.set(key, value);
    if (ttl) {
      this.ttls.set(key, ttl);
    }
  }
  
  async del(key: string): Promise<void> {
    this.store.delete(key);
    this.ttls.delete(key);
  }
  
  async keys(pattern: string): Promise<string[]> {
    const regex = new RegExp('^' + pattern.replace('*', '.*') + '$');
    return Array.from(this.store.keys()).filter(key => regex.test(key));
  }
  
  clear(): void {
    this.store.clear();
    this.ttls.clear();
  }
  
  getStore(): Map<string, string> {
    return this.store;
  }
}

// Helper to create operation event
function createOperationEvent(overrides: Partial<OperationEvent> = {}): OperationEvent {
  return {
    id: generateUUID(),
    operationId: generateUUID(),
    sessionId: generateUUID(),
    userId: generateUUID(),
    type: 'stdout',
    content: 'Test event content',
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('EventStore', () => {
  let eventStore: EventStore;
  let redisClient: MockRedisClient;
  let config: EventStoreConfig;
  
  beforeEach(() => {
    redisClient = new MockRedisClient();
    config = {
      maxEventsPerOperation: 100,
      retentionHours: 24,
      redis: redisClient as unknown as RedisClient,
      cleanupIntervalMs: 60000,
    };
    eventStore = new EventStore(config);
  });
  
  afterEach(() => {
    eventStore.destroy();
    redisClient.clear();
  });
  
  describe('storeEvent', () => {
    it('should store a single event', async () => {
      const event = createOperationEvent();
      
      await eventStore.storeEvent(event);
      
      const events = await eventStore.getEvents(event.operationId);
      expect(events).toHaveLength(1);
      expect(events[0].id).toBe(event.id);
    });
    
    it('should store event in memory buffer', async () => {
      const event = createOperationEvent();
      
      await eventStore.storeEvent(event);
      
      const stats = eventStore.getStats();
      expect(stats.buffer.totalEvents).toBe(1);
      expect(stats.buffer.operationCount).toBe(1);
    });
    
    it('should persist event to Redis', async () => {
      const event = createOperationEvent();
      
      await eventStore.storeEvent(event);
      
      const key = `events:${event.operationId}`;
      const data = await redisClient.get(key);
      expect(data).not.toBeNull();
      
      const stored = JSON.parse(data!);
      expect(stored).toHaveLength(1);
      expect(stored[0].id).toBe(event.id);
    });
    
    it('should handle multiple events for same operation', async () => {
      const operationId = generateUUID();
      const events = [
        createOperationEvent({ operationId }),
        createOperationEvent({ operationId }),
        createOperationEvent({ operationId }),
      ];
      
      for (const event of events) {
        await eventStore.storeEvent(event);
      }
      
      const retrieved = await eventStore.getEvents(operationId);
      expect(retrieved).toHaveLength(3);
    });
  });
  
  describe('storeEvents', () => {
    it('should store multiple events in batch', async () => {
      const operationId = generateUUID();
      const events = [
        createOperationEvent({ operationId }),
        createOperationEvent({ operationId }),
        createOperationEvent({ operationId }),
      ];
      
      await eventStore.storeEvents(events);
      
      const retrieved = await eventStore.getEvents(operationId);
      expect(retrieved).toHaveLength(3);
    });
    
    it('should store events for multiple operations', async () => {
      const op1 = generateUUID();
      const op2 = generateUUID();
      const events = [
        createOperationEvent({ operationId: op1 }),
        createOperationEvent({ operationId: op2 }),
        createOperationEvent({ operationId: op1 }),
      ];
      
      await eventStore.storeEvents(events);
      
      const op1Events = await eventStore.getEvents(op1);
      const op2Events = await eventStore.getEvents(op2);
      
      expect(op1Events).toHaveLength(2);
      expect(op2Events).toHaveLength(1);
    });
  });
  
  describe('getEvents', () => {
    it('should get all events for an operation', async () => {
      const operationId = generateUUID();
      const events = Array.from({ length: 5 }, () => createOperationEvent({ operationId }));
      
      await eventStore.storeEvents(events);
      
      const retrieved = await eventStore.getEvents(operationId);
      expect(retrieved).toHaveLength(5);
    });
    
    it('should respect limit option', async () => {
      const operationId = generateUUID();
      const events = Array.from({ length: 10 }, () => createOperationEvent({ operationId }));
      
      await eventStore.storeEvents(events);
      
      const retrieved = await eventStore.getEvents(operationId, { limit: 5 });
      expect(retrieved).toHaveLength(5);
    });
    
    it('should respect offset option', async () => {
      const operationId = generateUUID();
      const events = Array.from({ length: 10 }, () => createOperationEvent({ operationId }));
      
      await eventStore.storeEvents(events);
      
      const retrieved = await eventStore.getEvents(operationId, { offset: 5, limit: 3 });
      expect(retrieved).toHaveLength(3);
    });
    
    it('should filter by event types', async () => {
      const operationId = generateUUID();
      const events = [
        createOperationEvent({ operationId, type: 'stdout' }),
        createOperationEvent({ operationId, type: 'stderr' }),
        createOperationEvent({ operationId, type: 'stdout' }),
      ];
      
      await eventStore.storeEvents(events);
      
      const retrieved = await eventStore.getEvents(operationId, {
        types: ['stdout'],
      });
      
      expect(retrieved).toHaveLength(2);
      expect(retrieved.every(e => e.type === 'stdout')).toBe(true);
    });
    
    it('should filter by time range', async () => {
      const operationId = generateUUID();
      const now = Date.now();
      const events = [
        createOperationEvent({ operationId, timestamp: now - 1000 }),
        createOperationEvent({ operationId, timestamp: now }),
        createOperationEvent({ operationId, timestamp: now + 1000 }),
      ];
      
      await eventStore.storeEvents(events);
      
      const retrieved = await eventStore.getEvents(operationId, {
        startTime: now,
        endTime: now + 2000,
      });
      
      expect(retrieved).toHaveLength(2);
    });
    
    it('should sort events by timestamp', async () => {
      const operationId = generateUUID();
      const now = Date.now();
      const events = [
        createOperationEvent({ operationId, timestamp: now + 1000 }),
        createOperationEvent({ operationId, timestamp: now }),
        createOperationEvent({ operationId, timestamp: now + 2000 }),
      ];
      
      await eventStore.storeEvents(events);
      
      const ascending = await eventStore.getEvents(operationId, { order: 'asc' });
      expect(ascending[0].timestamp).toBeLessThan(ascending[1].timestamp);
      
      const descending = await eventStore.getEvents(operationId, { order: 'desc' });
      expect(descending[0].timestamp).toBeGreaterThan(descending[1].timestamp);
    });
  });
  
  describe('getRecentEvents', () => {
    it('should get recent events across all operations', async () => {
      const ops = [generateUUID(), generateUUID(), generateUUID()];
      
      for (const op of ops) {
        await eventStore.storeEvent(createOperationEvent({ operationId: op }));
      }
      
      const recent = await eventStore.getRecentEvents(10);
      expect(recent).toHaveLength(3);
    });
    
    it('should respect limit', async () => {
      const op = generateUUID();
      const events = Array.from({ length: 10 }, () => createOperationEvent({ operationId: op }));
      
      await eventStore.storeEvents(events);
      
      const recent = await eventStore.getRecentEvents(5);
      expect(recent).toHaveLength(5);
    });
    
    it('should return most recent events first', async () => {
      const op = generateUUID();
      const now = Date.now();
      const events = [
        createOperationEvent({ operationId: op, timestamp: now }),
        createOperationEvent({ operationId: op, timestamp: now + 1000 }),
        createOperationEvent({ operationId: op, timestamp: now + 2000 }),
      ];
      
      await eventStore.storeEvents(events);
      
      const recent = await eventStore.getRecentEvents(10);
      expect(recent[0].timestamp).toBeGreaterThan(recent[1].timestamp);
    });
  });
  
  describe('clearOperation', () => {
    it('should clear events for an operation', async () => {
      const operationId = generateUUID();
      const events = Array.from({ length: 5 }, () => createOperationEvent({ operationId }));
      
      await eventStore.storeEvents(events);
      
      await eventStore.clearOperation(operationId);
      
      const retrieved = await eventStore.getEvents(operationId);
      expect(retrieved).toHaveLength(0);
    });
    
    it('should not affect other operations', async () => {
      const op1 = generateUUID();
      const op2 = generateUUID();
      
      await eventStore.storeEvent(createOperationEvent({ operationId: op1 }));
      await eventStore.storeEvent(createOperationEvent({ operationId: op2 }));
      
      await eventStore.clearOperation(op1);
      
      const op1Events = await eventStore.getEvents(op1);
      const op2Events = await eventStore.getEvents(op2);
      
      expect(op1Events).toHaveLength(0);
      expect(op2Events).toHaveLength(1);
    });
  });
  
  describe('getStats', () => {
    it('should return buffer statistics', async () => {
      const op1 = generateUUID();
      const op2 = generateUUID();
      
      await eventStore.storeEvent(createOperationEvent({ operationId: op1 }));
      await eventStore.storeEvent(createOperationEvent({ operationId: op1 }));
      await eventStore.storeEvent(createOperationEvent({ operationId: op2 }));
      
      const stats = eventStore.getStats();
      
      expect(stats.buffer.operationCount).toBe(2);
      expect(stats.buffer.totalEvents).toBe(3);
      expect(stats.config.maxEventsPerOperation).toBe(config.maxEventsPerOperation);
      expect(stats.config.retentionHours).toBe(config.retentionHours);
    });
  });
  
  describe('replayEvents', () => {
    it('should replay events in chronological order', async () => {
      const operationId = generateUUID();
      const now = Date.now();
      const events = [
        createOperationEvent({ operationId, timestamp: now + 2000 }),
        createOperationEvent({ operationId, timestamp: now }),
        createOperationEvent({ operationId, timestamp: now + 1000 }),
      ];
      
      await eventStore.storeEvents(events);
      
      const replayed = await eventStore.replayEvents(operationId);
      
      expect(replayed).toHaveLength(3);
      expect(replayed[0].timestamp).toBeLessThan(replayed[1].timestamp);
      expect(replayed[1].timestamp).toBeLessThan(replayed[2].timestamp);
    });
    
    it('should support filtering during replay', async () => {
      const operationId = generateUUID();
      const now = Date.now();
      const events = [
        createOperationEvent({ operationId, timestamp: now, type: 'stdout' }),
        createOperationEvent({ operationId, timestamp: now + 1000, type: 'stderr' }),
        createOperationEvent({ operationId, timestamp: now + 2000, type: 'stdout' }),
      ];
      
      await eventStore.storeEvents(events);
      
      const replayed = await eventStore.replayEvents(operationId, {
        types: ['stdout'],
      });
      
      expect(replayed).toHaveLength(2);
      expect(replayed.every(e => e.type === 'stdout')).toBe(true);
    });
  });
  
  describe('searchEvents', () => {
    it('should search events by content', async () => {
      const operationId = generateUUID();
      const events = [
        createOperationEvent({ operationId, content: 'Error: file not found' }),
        createOperationEvent({ operationId, content: 'Success: operation completed' }),
        createOperationEvent({ operationId, content: 'Warning: deprecated API' }),
      ];
      
      await eventStore.storeEvents(events);
      
      const results = await eventStore.searchEvents('error', { operationId });
      
      expect(results).toHaveLength(1);
      expect(results[0].content).toContain('Error');
    });
    
    it('should be case-insensitive', async () => {
      const operationId = generateUUID();
      const event = createOperationEvent({ operationId, content: 'ERROR: Test Error' });
      
      await eventStore.storeEvent(event);
      
      const results = await eventStore.searchEvents('error', { operationId });
      expect(results).toHaveLength(1);
    });
    
    it('should search across all operations when operationId not specified', async () => {
      const op1 = generateUUID();
      const op2 = generateUUID();
      
      await eventStore.storeEvent(createOperationEvent({ operationId: op1, content: 'Test message 1' }));
      await eventStore.storeEvent(createOperationEvent({ operationId: op2, content: 'Test message 2' }));
      
      const results = await eventStore.searchEvents('test');
      expect(results.length).toBeGreaterThanOrEqual(2);
    });
  });
  
  describe('cleanup', () => {
    it('should remove expired events', async () => {
      const shortRetentionStore = new EventStore({
        ...config,
        retentionHours: 0, // Immediate expiration
      });
      
      const operationId = generateUUID();
      await shortRetentionStore.storeEvent(createOperationEvent({ operationId }));
      
      // Wait a bit to ensure events are expired
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const removedCount = await shortRetentionStore.cleanup();
      expect(removedCount).toBeGreaterThan(0);
      
      shortRetentionStore.destroy();
    });
    
    it('should preserve non-expired events', async () => {
      const operationId = generateUUID();
      await eventStore.storeEvent(createOperationEvent({ operationId }));
      
      const removedCount = await eventStore.cleanup();
      
      const events = await eventStore.getEvents(operationId);
      expect(events).toHaveLength(1);
      expect(removedCount).toBe(0);
    });
  });
  
  describe('destroy', () => {
    it('should cleanup all resources', () => {
      const operationId = generateUUID();
      eventStore.storeEvent(createOperationEvent({ operationId }));
      
      eventStore.destroy();
      
      const stats = eventStore.getStats();
      expect(stats.buffer.totalEvents).toBe(0);
      expect(stats.buffer.operationCount).toBe(0);
    });
  });
  
  describe('buffer management', () => {
    it('should trim buffer when exceeding max size', async () => {
      const smallBufferStore = new EventStore({
        ...config,
        maxEventsPerOperation: 5,
      });
      
      const operationId = generateUUID();
      const events = Array.from({ length: 10 }, () => createOperationEvent({ operationId }));
      
      await smallBufferStore.storeEvents(events);
      
      const stats = smallBufferStore.getStats();
      expect(stats.buffer.totalEvents).toBeLessThanOrEqual(5);
      
      smallBufferStore.destroy();
    });
    
    it('should keep most recent events when trimming', async () => {
      const smallBufferStore = new EventStore({
        ...config,
        maxEventsPerOperation: 3,
      });
      
      const operationId = generateUUID();
      const now = Date.now();
      const events = [
        createOperationEvent({ operationId, timestamp: now, content: 'Event 1' }),
        createOperationEvent({ operationId, timestamp: now + 1000, content: 'Event 2' }),
        createOperationEvent({ operationId, timestamp: now + 2000, content: 'Event 3' }),
        createOperationEvent({ operationId, timestamp: now + 3000, content: 'Event 4' }),
        createOperationEvent({ operationId, timestamp: now + 4000, content: 'Event 5' }),
      ];
      
      await smallBufferStore.storeEvents(events);
      
      const retrieved = await smallBufferStore.getEvents(operationId);
      expect(retrieved.length).toBeLessThanOrEqual(3);
      
      // Should have most recent events
      const hasEvent5 = retrieved.some(e => e.content === 'Event 5');
      expect(hasEvent5).toBe(true);
      
      smallBufferStore.destroy();
    });
  });
  
  describe('deduplication', () => {
    it('should handle duplicate event IDs', async () => {
      const operationId = generateUUID();
      const eventId = generateUUID();
      
      // Store same event twice (simulate duplicate)
      const event1 = createOperationEvent({ id: eventId, operationId, content: 'First' });
      const event2 = createOperationEvent({ id: eventId, operationId, content: 'Second' });
      
      await eventStore.storeEvent(event1);
      await eventStore.storeEvent(event2);
      
      const retrieved = await eventStore.getEvents(operationId);
      
      // Should have both events (no automatic dedup in store method)
      expect(retrieved.length).toBeGreaterThan(0);
    });
  });
});