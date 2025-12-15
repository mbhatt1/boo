/**
 * EventStreamingService Tests
 * 
 * Comprehensive tests for real-time event streaming, including:
 * - Subscribe/unsubscribe operations
 * - Event broadcasting and delivery
 * - Event deduplication
 * - Rate limiting
 * - Event buffering for late joiners
 * - WebSocket delivery
 * - Permission-based filtering
 * - Statistics and monitoring
 * - Cleanup operations
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { EventStreamingService, EventStreamingConfig } from '../../services/EventStreamingService.js';
import { SessionManager } from '../../services/SessionManager.js';
import { EventStore } from '../../services/EventStore.js';
import { UserFactory, SessionFactory, EventFactory } from '../factories/index.js';
import { generateUUID, sleep, waitForCondition } from '../setup/test-helpers.js';
import { WebSocket } from 'ws';

// Mock WebSocket
class MockWebSocket {
  readyState = 1; // OPEN
  messages: string[] = [];
  
  send(data: string): void {
    this.messages.push(data);
  }
  
  close(): void {
    this.readyState = 3; // CLOSED
  }
  
  getLastMessage(): any {
    if (this.messages.length === 0) return null;
    return JSON.parse(this.messages[this.messages.length - 1]);
  }
  
  getAllMessages(): any[] {
    return this.messages.map(m => JSON.parse(m));
  }
  
  clearMessages(): void {
    this.messages = [];
  }
}

// Mock SessionManager
class MockSessionManager {
  private sessions = new Map<string, any>();
  
  async getSession(sessionId: string): Promise<any> {
    return this.sessions.get(sessionId) || null;
  }
  
  addSession(session: any): void {
    this.sessions.set(session.id, session);
  }
}

// Mock EventStore
class MockEventStore {
  private events: any[] = [];
  
  async storeEvent(event: any): Promise<void> {
    this.events.push(event);
  }
  
  getStoredEvents(): any[] {
    return this.events;
  }
  
  clear(): void {
    this.events = [];
  }
}

describe('EventStreamingService', () => {
  let service: EventStreamingService;
  let sessionManager: MockSessionManager;
  let eventStore: MockEventStore;
  let config: EventStreamingConfig;
  
  beforeEach(() => {
    config = {
      rateLimitPerSecond: 10,
      deduplicationWindowMs: 5000,
      bufferSize: 50,
      persistEvents: true,
    };
    
    sessionManager = new MockSessionManager();
    eventStore = new MockEventStore();
    service = new EventStreamingService(
      config,
      sessionManager as unknown as SessionManager,
      eventStore as unknown as EventStore
    );
  });
  
  afterEach(() => {
    service.destroy();
  });
  
  describe('subscribe', () => {
    it('should subscribe a user to operation events', async () => {
      const user = UserFactory.create();
      const session = SessionFactory.create();
      const operationId = generateUUID();
      const ws = new MockWebSocket() as unknown as WebSocket;
      
      sessionManager.addSession(session);
      
      await service.subscribe(
        operationId,
        session.id,
        user.id,
        ws,
        user.role
      );
      
      expect(service.isSubscribed(operationId, user.id)).toBe(true);
      expect(service.getSubscriberCount(operationId)).toBe(1);
    });
    
    it('should support multiple subscribers for same operation', async () => {
      const users = UserFactory.createMany(3);
      const session = SessionFactory.create();
      const operationId = generateUUID();
      
      sessionManager.addSession(session);
      
      for (const user of users) {
        const ws = new MockWebSocket() as unknown as WebSocket;
        await service.subscribe(
          operationId,
          session.id,
          user.id,
          ws,
          user.role
        );
      }
      
      expect(service.getSubscriberCount(operationId)).toBe(3);
      const subscribers = service.getSubscribers(operationId);
      expect(subscribers).toHaveLength(3);
    });
    
    it('should throw error if session not found', async () => {
      const user = UserFactory.create();
      const operationId = generateUUID();
      const ws = new MockWebSocket() as unknown as WebSocket;
      
      await expect(
        service.subscribe(
          operationId,
          'nonexistent_session',
          user.id,
          ws,
          user.role
        )
      ).rejects.toThrow('Session nonexistent_session not found');
    });
    
    it('should replay buffered events to new subscriber', async () => {
      const user1 = UserFactory.create();
      const user2 = UserFactory.create();
      const session = SessionFactory.create();
      const operationId = generateUUID();
      const ws1 = new MockWebSocket() as unknown as WebSocket;
      const ws2 = new MockWebSocket() as unknown as WebSocket;
      
      sessionManager.addSession(session);
      
      // First subscriber
      await service.subscribe(operationId, session.id, user1.id, ws1, user1.role);
      
      // Send some events
      for (let i = 0; i < 3; i++) {
        const operationEvent = {
          id: generateUUID(),
          operationId,
          sessionId: session.id,
          userId: user1.id,
          type: 'stdout' as const,
          content: `Test event ${i}`,
          timestamp: Date.now(),
        };
        await service.broadcastEvent(operationEvent);
      }
      
      // Second subscriber (late joiner)
      await service.subscribe(operationId, session.id, user2.id, ws2, user2.role);
      
      // Check that ws2 received replayed events
      const ws2Messages = (ws2 as unknown as MockWebSocket).getAllMessages();
      expect(ws2Messages.length).toBeGreaterThan(0);
      expect(ws2Messages.some(m => m.replayed === true)).toBe(true);
    });
  });
  
  describe('unsubscribe', () => {
    it('should unsubscribe a user from operation events', async () => {
      const user = UserFactory.create();
      const session = SessionFactory.create();
      const operationId = generateUUID();
      const ws = new MockWebSocket() as unknown as WebSocket;
      
      sessionManager.addSession(session);
      
      await service.subscribe(operationId, session.id, user.id, ws, user.role);
      expect(service.isSubscribed(operationId, user.id)).toBe(true);
      
      service.unsubscribe(operationId, user.id);
      expect(service.isSubscribed(operationId, user.id)).toBe(false);
    });
    
    it('should cleanup empty subscriptions', async () => {
      const user = UserFactory.create();
      const session = SessionFactory.create();
      const operationId = generateUUID();
      const ws = new MockWebSocket() as unknown as WebSocket;
      
      sessionManager.addSession(session);
      
      await service.subscribe(operationId, session.id, user.id, ws, user.role);
      expect(service.getActiveOperations()).toContain(operationId);
      
      service.unsubscribe(operationId, user.id);
      expect(service.getActiveOperations()).not.toContain(operationId);
    });
    
    it('should handle unsubscribe for non-existent subscription', () => {
      // Should not throw
      expect(() => {
        service.unsubscribe('nonexistent_op', 'nonexistent_user');
      }).not.toThrow();
    });
  });
  
  describe('broadcastEvent', () => {
    it('should broadcast event to all subscribers', async () => {
      const users = UserFactory.createMany(3);
      const session = SessionFactory.create();
      const operationId = generateUUID();
      const websockets: MockWebSocket[] = [];
      
      sessionManager.addSession(session);
      
      // Subscribe all users
      for (const user of users) {
        const ws = new MockWebSocket();
        websockets.push(ws);
        await service.subscribe(
          operationId,
          session.id,
          user.id,
          ws as unknown as WebSocket,
          user.role
        );
      }
      
      // Broadcast event
      const event = {
        id: generateUUID(),
        operationId,
        sessionId: session.id,
        userId: users[0].id,
        type: 'stdout' as const,
        content: 'Test comment',
        timestamp: Date.now(),
      };
      
      await service.broadcastEvent(event);
      
      // Verify all subscribers received the event
      for (const ws of websockets) {
        expect(ws.messages.length).toBeGreaterThan(0);
        const lastMessage = ws.getLastMessage();
        expect(lastMessage.type).toBe('operation.stream');
        expect(lastMessage.event.id).toBe(event.id);
      }
    });
    
    it('should deduplicate events', async () => {
      const user = UserFactory.create();
      const session = SessionFactory.create();
      const operationId = generateUUID();
      const ws = new MockWebSocket();
      
      sessionManager.addSession(session);
      await service.subscribe(
        operationId,
        session.id,
        user.id,
        ws as unknown as WebSocket,
        user.role
      );
      
      const event = {
        id: generateUUID(),
        operationId,
        sessionId: session.id,
        userId: user.id,
        type: 'stdout' as const,
        content: 'Test content',
        timestamp: Date.now(),
      };
      
      // Send same event twice
      await service.broadcastEvent(event);
      const messageCount1 = ws.messages.length;
      
      await service.broadcastEvent(event);
      const messageCount2 = ws.messages.length;
      
      // Second broadcast should be deduplicated
      expect(messageCount2).toBe(messageCount1);
    });
    
    it('should respect rate limits', async () => {
      const fastConfig: EventStreamingConfig = {
        rateLimitPerSecond: 2, // Very low limit for testing
        deduplicationWindowMs: 5000,
        bufferSize: 50,
        persistEvents: false,
      };
      
      const fastService = new EventStreamingService(
        fastConfig,
        sessionManager as unknown as SessionManager,
        eventStore as unknown as EventStore
      );
      
      const user = UserFactory.create();
      const session = SessionFactory.create();
      const operationId = generateUUID();
      const ws = new MockWebSocket();
      
      sessionManager.addSession(session);
      await fastService.subscribe(
        operationId,
        session.id,
        user.id,
        ws as unknown as WebSocket,
        user.role
      );
      
      // Send multiple events rapidly
      for (let i = 0; i < 5; i++) {
        const event = {
          id: generateUUID(),
          operationId,
          sessionId: session.id,
          userId: user.id,
          type: 'stdout' as const,
          content: `Content ${i}`,
          timestamp: Date.now(),
        };
        await fastService.broadcastEvent(event);
      }
      
      // Should have received fewer messages due to rate limiting
      expect(ws.messages.length).toBeLessThan(5);
      
      fastService.destroy();
    });
    
    it('should persist events when configured', async () => {
      const user = UserFactory.create();
      const session = SessionFactory.create();
      const operationId = generateUUID();
      const ws = new MockWebSocket();
      
      sessionManager.addSession(session);
      await service.subscribe(
        operationId,
        session.id,
        user.id,
        ws as unknown as WebSocket,
        user.role
      );
      
      const event = {
        id: generateUUID(),
        operationId,
        sessionId: session.id,
        userId: user.id,
        type: 'stdout' as const,
        content: 'Test content',
        timestamp: Date.now(),
      };
      
      await service.broadcastEvent(event);
      
      expect(eventStore.getStoredEvents()).toHaveLength(1);
      expect(eventStore.getStoredEvents()[0].id).toBe(event.id);
    });
    
    it('should buffer events for late joiners', async () => {
      const user = UserFactory.create();
      const session = SessionFactory.create();
      const operationId = generateUUID();
      const ws = new MockWebSocket();
      
      sessionManager.addSession(session);
      await service.subscribe(
        operationId,
        session.id,
        user.id,
        ws as unknown as WebSocket,
        user.role
      );
      
      // Send multiple events
      for (let i = 0; i < 10; i++) {
        const operationEvent = {
          id: generateUUID(),
          operationId,
          sessionId: session.id,
          userId: user.id,
          type: 'stdout' as const,
          content: `Event ${i}`,
          timestamp: Date.now(),
        };
        await service.broadcastEvent(operationEvent);
      }
      
      // Check buffer maintained
      const stats = service.getStats();
      const opStats = stats.operationStats.find(s => s.operationId === operationId);
      expect(opStats?.bufferSize).toBeGreaterThan(0);
      expect(opStats?.bufferSize).toBeLessThanOrEqual(config.bufferSize);
    });
    
    it('should skip delivery to closed websockets', async () => {
      const user = UserFactory.create();
      const session = SessionFactory.create();
      const operationId = generateUUID();
      const ws = new MockWebSocket();
      ws.readyState = 3; // CLOSED
      
      sessionManager.addSession(session);
      await service.subscribe(
        operationId,
        session.id,
        user.id,
        ws as unknown as WebSocket,
        user.role
      );
      
      const event = {
        id: generateUUID(),
        operationId,
        sessionId: session.id,
        userId: user.id,
        type: 'stdout' as const,
        content: 'Test content',
        timestamp: Date.now(),
      };
      
      // Should not throw even with closed websocket
      await expect(service.broadcastEvent(event)).resolves.not.toThrow();
      expect(ws.messages.length).toBe(0);
    });
  });
  
  describe('broadcastEvents', () => {
    it('should broadcast multiple events in batch', async () => {
      const user = UserFactory.create();
      const session = SessionFactory.create();
      const operationId = generateUUID();
      const ws = new MockWebSocket();
      
      sessionManager.addSession(session);
      await service.subscribe(
        operationId,
        session.id,
        user.id,
        ws as unknown as WebSocket,
        user.role
      );
      
      const events = Array.from({ length: 5 }, (_, i) => ({
        id: generateUUID(),
        operationId,
        sessionId: session.id,
        userId: user.id,
        type: 'stdout' as const,
        content: `Content ${i}`,
        timestamp: Date.now(),
      }));
      
      await service.broadcastEvents(events);
      
      expect(ws.messages.length).toBeGreaterThan(0);
    });
  });
  
  describe('getSubscribers', () => {
    it('should return all subscribers for an operation', async () => {
      const users = UserFactory.createMany(3);
      const session = SessionFactory.create();
      const operationId = generateUUID();
      
      sessionManager.addSession(session);
      
      for (const user of users) {
        const ws = new MockWebSocket() as unknown as WebSocket;
        await service.subscribe(operationId, session.id, user.id, ws, user.role);
      }
      
      const subscribers = service.getSubscribers(operationId);
      expect(subscribers).toHaveLength(3);
      expect(subscribers.map(s => s.userId)).toContain(users[0].id);
      expect(subscribers.map(s => s.userId)).toContain(users[1].id);
      expect(subscribers.map(s => s.userId)).toContain(users[2].id);
    });
    
    it('should return empty array for non-existent operation', () => {
      const subscribers = service.getSubscribers('nonexistent');
      expect(subscribers).toEqual([]);
    });
  });
  
  describe('getSubscriberCount', () => {
    it('should return correct subscriber count', async () => {
      const users = UserFactory.createMany(5);
      const session = SessionFactory.create();
      const operationId = generateUUID();
      
      sessionManager.addSession(session);
      
      expect(service.getSubscriberCount(operationId)).toBe(0);
      
      for (const user of users) {
        const ws = new MockWebSocket() as unknown as WebSocket;
        await service.subscribe(operationId, session.id, user.id, ws, user.role);
      }
      
      expect(service.getSubscriberCount(operationId)).toBe(5);
    });
  });
  
  describe('isSubscribed', () => {
    it('should return true for subscribed user', async () => {
      const user = UserFactory.create();
      const session = SessionFactory.create();
      const operationId = generateUUID();
      const ws = new MockWebSocket() as unknown as WebSocket;
      
      sessionManager.addSession(session);
      
      expect(service.isSubscribed(operationId, user.id)).toBe(false);
      
      await service.subscribe(operationId, session.id, user.id, ws, user.role);
      expect(service.isSubscribed(operationId, user.id)).toBe(true);
    });
    
    it('should return false for non-subscribed user', () => {
      expect(service.isSubscribed('op_123', 'user_456')).toBe(false);
    });
  });
  
  describe('getActiveOperations', () => {
    it('should return all active operation IDs', async () => {
      const user = UserFactory.create();
      const session = SessionFactory.create();
      const operationIds = [generateUUID(), generateUUID(), generateUUID()];
      
      sessionManager.addSession(session);
      
      for (const operationId of operationIds) {
        const ws = new MockWebSocket() as unknown as WebSocket;
        await service.subscribe(operationId, session.id, user.id, ws, user.role);
      }
      
      const activeOps = service.getActiveOperations();
      expect(activeOps).toHaveLength(3);
      expect(activeOps).toContain(operationIds[0]);
      expect(activeOps).toContain(operationIds[1]);
      expect(activeOps).toContain(operationIds[2]);
    });
    
    it('should return empty array when no active operations', () => {
      expect(service.getActiveOperations()).toEqual([]);
    });
  });
  
  describe('onEvent', () => {
    it('should register global event handler', async () => {
      const user = UserFactory.create();
      const session = SessionFactory.create();
      const operationId = generateUUID();
      const ws = new MockWebSocket() as unknown as WebSocket;
      
      sessionManager.addSession(session);
      await service.subscribe(operationId, session.id, user.id, ws, user.role);
      
      let receivedEvent: any = null;
      service.onEvent((event) => {
        receivedEvent = event;
      });
      
      const event = {
        id: generateUUID(),
        operationId,
        sessionId: session.id,
        userId: user.id,
        type: 'stdout' as const,
        content: 'Test content',
        timestamp: Date.now(),
      };
      
      await service.broadcastEvent(event);
      
      expect(receivedEvent).not.toBeNull();
      expect(receivedEvent.id).toBe(event.id);
    });
    
    it('should support unsubscribing global handler', async () => {
      const user = UserFactory.create();
      const session = SessionFactory.create();
      const operationId = generateUUID();
      const ws = new MockWebSocket() as unknown as WebSocket;
      
      sessionManager.addSession(session);
      await service.subscribe(operationId, session.id, user.id, ws, user.role);
      
      let callCount = 0;
      const unsubscribe = service.onEvent(() => {
        callCount++;
      });
      
      const event = {
        id: generateUUID(),
        operationId,
        sessionId: session.id,
        userId: user.id,
        type: 'stdout' as const,
        content: 'Test content',
        timestamp: Date.now(),
      };
      
      await service.broadcastEvent(event);
      expect(callCount).toBe(1);
      
      // Unsubscribe
      unsubscribe();
      
      // Send another event
      const event2 = { ...event, id: generateUUID(), content: 'Test content 2' };
      await service.broadcastEvent(event2);
      
      // Handler should not be called again
      expect(callCount).toBe(1);
    });
  });
  
  describe('getStats', () => {
    it('should return comprehensive statistics', async () => {
      const users = UserFactory.createMany(3);
      const session = SessionFactory.create();
      const operationIds = [generateUUID(), generateUUID()];
      
      sessionManager.addSession(session);
      
      // Subscribe users to operations
      for (const operationId of operationIds) {
        for (const user of users) {
          const ws = new MockWebSocket() as unknown as WebSocket;
          await service.subscribe(operationId, session.id, user.id, ws, user.role);
        }
      }
      
      const stats = service.getStats();
      
      expect(stats.activeOperations).toBe(2);
      expect(stats.totalSubscribers).toBe(6);
      expect(stats.operationStats).toHaveLength(2);
      expect(stats.dedupStats).toBeDefined();
    });
    
    it('should track per-operation statistics', async () => {
      const user = UserFactory.create();
      const session = SessionFactory.create();
      const operationId = generateUUID();
      const ws = new MockWebSocket() as unknown as WebSocket;
      
      sessionManager.addSession(session);
      await service.subscribe(operationId, session.id, user.id, ws, user.role);
      
      // Send some events
      for (let i = 0; i < 5; i++) {
        const event = {
          id: generateUUID(),
          operationId,
          sessionId: session.id,
          userId: user.id,
          type: 'stdout' as const,
          content: `Content ${i}`,
          timestamp: Date.now(),
        };
        await service.broadcastEvent(event);
      }
      
      const stats = service.getStats();
      const opStats = stats.operationStats.find(s => s.operationId === operationId);
      
      expect(opStats).toBeDefined();
      expect(opStats!.subscribers).toBe(1);
      expect(opStats!.bufferSize).toBeGreaterThan(0);
    });
  });
  
  describe('cleanup', () => {
    it('should remove inactive subscriptions', async () => {
      const user = UserFactory.create();
      const session = SessionFactory.create();
      const operationId = generateUUID();
      const ws = new MockWebSocket() as unknown as WebSocket;
      
      sessionManager.addSession(session);
      await service.subscribe(operationId, session.id, user.id, ws, user.role);
      
      expect(service.getActiveOperations()).toContain(operationId);
      
      // Cleanup with very short max age (0ms = remove all)
      service.cleanup(0);
      
      expect(service.getActiveOperations()).not.toContain(operationId);
    });
    
    it('should preserve active subscriptions', async () => {
      const user = UserFactory.create();
      const session = SessionFactory.create();
      const operationId = generateUUID();
      const ws = new MockWebSocket() as unknown as WebSocket;
      
      sessionManager.addSession(session);
      await service.subscribe(operationId, session.id, user.id, ws, user.role);
      
      // Send a recent event to update lastEventTime
      const event = {
        id: generateUUID(),
        operationId,
        sessionId: session.id,
        userId: user.id,
        type: 'stdout' as const,
        content: 'Test content',
        timestamp: Date.now(),
      };
      await service.broadcastEvent(event);
      
      // Cleanup with long max age
      service.cleanup(3600000); // 1 hour
      
      // Subscription should still exist
      expect(service.getActiveOperations()).toContain(operationId);
    });
  });
  
  describe('destroy', () => {
    it('should cleanup all resources', async () => {
      const user = UserFactory.create();
      const session = SessionFactory.create();
      const operationId = generateUUID();
      const ws = new MockWebSocket() as unknown as WebSocket;
      
      sessionManager.addSession(session);
      await service.subscribe(operationId, session.id, user.id, ws, user.role);
      
      service.destroy();
      
      expect(service.getActiveOperations()).toEqual([]);
      expect(service.getSubscriberCount(operationId)).toBe(0);
    });
  });
});