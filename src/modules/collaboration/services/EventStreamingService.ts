/**
 * Event Streaming Service - Real-time event distribution
 * 
 * Manages the flow of operation events from the Python backend to all
 * session participants. Handles deduplication, filtering, rate limiting,
 * and buffering for reliable event delivery.
 */

import type { OperationEvent, UserRole } from '../types/index.js';
import type { SessionManager } from './SessionManager.js';
import type { EventStore } from './EventStore.js';
import { EventDeduplicator } from '../utils/EventDeduplicator.js';
import { WebSocket } from 'ws';

/**
 * Event streaming configuration
 */
export interface EventStreamingConfig {
  /**
   * Maximum events per second per operation
   */
  rateLimitPerSecond: number;
  
  /**
   * Deduplication window in milliseconds
   */
  deduplicationWindowMs: number;
  
  /**
   * Buffer size for reconnection replay
   */
  bufferSize: number;
  
  /**
   * Enable event persistence
   */
  persistEvents: boolean;
}

/**
 * Operation subscription info
 */
interface OperationSubscription {
  operationId: string;
  sessionId: string;
  subscribers: Map<string, SubscriberInfo>;
  rateLimiter: RateLimiter;
  eventBuffer: OperationEvent[];
}

/**
 * Subscriber information
 */
interface SubscriberInfo {
  userId: string;
  ws: WebSocket;
  role: UserRole;
  subscribedAt: number;
  lastEventTime: number;
}

/**
 * Rate limiter for event delivery
 */
class RateLimiter {
  private tokens: number;
  private maxTokens: number;
  private refillRate: number;
  private lastRefill: number;
  
  constructor(maxPerSecond: number) {
    this.maxTokens = maxPerSecond;
    this.tokens = maxPerSecond;
    this.refillRate = maxPerSecond;
    this.lastRefill = Date.now();
  }
  
  /**
   * Check if an event can be sent
   */
  canSend(): boolean {
    this.refill();
    return this.tokens >= 1;
  }
  
  /**
   * Consume a token for sending an event
   */
  consume(): boolean {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens--;
      return true;
    }
    return false;
  }
  
  /**
   * Refill tokens based on time elapsed
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }
  
  /**
   * Get current token count
   */
  getTokens(): number {
    this.refill();
    return this.tokens;
  }
}

/**
 * Event Streaming Service
 */
export class EventStreamingService {
  private config: EventStreamingConfig;
  private sessionManager: SessionManager;
  private eventStore: EventStore;
  private deduplicator: EventDeduplicator;
  private subscriptions: Map<string, OperationSubscription>;
  private globalEventHandlers: Set<(event: OperationEvent) => void>;
  
  constructor(
    config: EventStreamingConfig,
    sessionManager: SessionManager,
    eventStore: EventStore
  ) {
    this.config = config;
    this.sessionManager = sessionManager;
    this.eventStore = eventStore;
    this.deduplicator = new EventDeduplicator({
      windowMs: config.deduplicationWindowMs,
    });
    this.subscriptions = new Map();
    this.globalEventHandlers = new Set();
  }
  
  /**
   * Subscribe a user to operation events
   */
  async subscribe(
    operationId: string,
    sessionId: string,
    userId: string,
    ws: WebSocket,
    role: UserRole
  ): Promise<void> {
    // Verify user has permission to subscribe
    const session = await this.sessionManager.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    
    // Get or create subscription
    let subscription = this.subscriptions.get(operationId);
    if (!subscription) {
      subscription = {
        operationId,
        sessionId,
        subscribers: new Map(),
        rateLimiter: new RateLimiter(this.config.rateLimitPerSecond),
        eventBuffer: [],
      };
      this.subscriptions.set(operationId, subscription);
    }
    
    // Add subscriber
    subscription.subscribers.set(userId, {
      userId,
      ws,
      role,
      subscribedAt: Date.now(),
      lastEventTime: 0,
    });
    
    console.log(`[EventStreaming] User ${userId} subscribed to operation ${operationId}`);
    
    // Send buffered events for catchup
    await this.replayRecentEvents(operationId, userId, ws);
  }
  
  /**
   * Unsubscribe a user from operation events
   */
  unsubscribe(operationId: string, userId: string): void {
    const subscription = this.subscriptions.get(operationId);
    if (!subscription) {
      return;
    }
    
    subscription.subscribers.delete(userId);
    console.log(`[EventStreaming] User ${userId} unsubscribed from operation ${operationId}`);
    
    // Clean up empty subscriptions
    if (subscription.subscribers.size === 0) {
      this.subscriptions.delete(operationId);
    }
  }
  
  /**
   * Broadcast an event to all operation subscribers
   */
  async broadcastEvent(event: OperationEvent): Promise<void> {
    // Check for duplicate
    if (this.deduplicator.checkAndMark(event.id)) {
      console.log(`[EventStreaming] Duplicate event ${event.id} skipped`);
      return;
    }
    
    // Store event if persistence enabled
    if (this.config.persistEvents) {
      await this.eventStore.storeEvent(event);
    }
    
    // Get subscription for this operation
    const subscription = this.subscriptions.get(event.operationId);
    if (!subscription) {
      // No active subscribers
      return;
    }
    
    // Add to buffer for late joiners
    subscription.eventBuffer.push(event);
    if (subscription.eventBuffer.length > this.config.bufferSize) {
      subscription.eventBuffer.shift();
    }
    
    // Check rate limit
    if (!subscription.rateLimiter.canSend()) {
      console.warn(`[EventStreaming] Rate limit exceeded for operation ${event.operationId}`);
      return;
    }
    
    subscription.rateLimiter.consume();
    
    // Broadcast to all subscribers
    const deliveryPromises: Promise<void>[] = [];
    for (const [userId, subscriber] of subscription.subscribers.entries()) {
      // Filter based on permissions
      if (this.shouldDeliverEvent(event, subscriber.role)) {
        deliveryPromises.push(
          this.deliverEventToSubscriber(event, subscriber)
        );
      }
    }
    
    await Promise.allSettled(deliveryPromises);
    
    // Notify global handlers
    for (const handler of this.globalEventHandlers) {
      try {
        handler(event);
      } catch (error) {
        console.error('[EventStreaming] Error in global event handler:', error);
      }
    }
  }
  
  /**
   * Broadcast multiple events in batch
   */
  async broadcastEvents(events: OperationEvent[]): Promise<void> {
    const promises = events.map(event => this.broadcastEvent(event));
    await Promise.allSettled(promises);
  }
  
  /**
   * Get all subscribers for an operation
   */
  getSubscribers(operationId: string): SubscriberInfo[] {
    const subscription = this.subscriptions.get(operationId);
    if (!subscription) {
      return [];
    }
    return Array.from(subscription.subscribers.values());
  }
  
  /**
   * Get subscriber count for an operation
   */
  getSubscriberCount(operationId: string): number {
    const subscription = this.subscriptions.get(operationId);
    return subscription ? subscription.subscribers.size : 0;
  }
  
  /**
   * Check if a user is subscribed to an operation
   */
  isSubscribed(operationId: string, userId: string): boolean {
    const subscription = this.subscriptions.get(operationId);
    return subscription ? subscription.subscribers.has(userId) : false;
  }
  
  /**
   * Get all active operation subscriptions
   */
  getActiveOperations(): string[] {
    return Array.from(this.subscriptions.keys());
  }
  
  /**
   * Register a global event handler
   */
  onEvent(handler: (event: OperationEvent) => void): () => void {
    this.globalEventHandlers.add(handler);
    // Return unsubscribe function
    return () => {
      this.globalEventHandlers.delete(handler);
    };
  }
  
  /**
   * Get streaming statistics
   */
  getStats(): {
    activeOperations: number;
    totalSubscribers: number;
    dedupStats: ReturnType<EventDeduplicator['getStats']>;
    operationStats: Array<{
      operationId: string;
      subscribers: number;
      bufferSize: number;
      rateLimit: number;
    }>;
  } {
    const operationStats = Array.from(this.subscriptions.entries()).map(
      ([operationId, sub]) => ({
        operationId,
        subscribers: sub.subscribers.size,
        bufferSize: sub.eventBuffer.length,
        rateLimit: sub.rateLimiter.getTokens(),
      })
    );
    
    const totalSubscribers = operationStats.reduce(
      (sum, stat) => sum + stat.subscribers,
      0
    );
    
    return {
      activeOperations: this.subscriptions.size,
      totalSubscribers,
      dedupStats: this.deduplicator.getStats(),
      operationStats,
    };
  }
  
  /**
   * Cleanup inactive subscriptions
   */
  cleanup(maxAgeMs: number = 3600000): void {
    const now = Date.now();
    const toRemove: string[] = [];
    
    for (const [operationId, subscription] of this.subscriptions.entries()) {
      // Remove stale subscribers
      for (const [userId, subscriber] of subscription.subscribers.entries()) {
        if (now - subscriber.lastEventTime > maxAgeMs) {
          subscription.subscribers.delete(userId);
        }
      }
      
      // Mark subscription for removal if no subscribers
      if (subscription.subscribers.size === 0) {
        toRemove.push(operationId);
      }
    }
    
    // Remove empty subscriptions
    for (const operationId of toRemove) {
      this.subscriptions.delete(operationId);
    }
    
    console.log(`[EventStreaming] Cleanup removed ${toRemove.length} inactive subscriptions`);
  }
  
  /**
   * Destroy the service and cleanup resources
   */
  destroy(): void {
    this.subscriptions.clear();
    this.globalEventHandlers.clear();
    this.deduplicator.destroy();
  }
  
  // Private methods
  
  /**
   * Deliver an event to a specific subscriber
   */
  private async deliverEventToSubscriber(
    event: OperationEvent,
    subscriber: SubscriberInfo
  ): Promise<void> {
    try {
      if (subscriber.ws.readyState !== WebSocket.OPEN) {
        console.warn(`[EventStreaming] WebSocket not open for user ${subscriber.userId}`);
        return;
      }
      
      const message = JSON.stringify({
        type: 'operation.stream',
        operationId: event.operationId,
        sessionId: event.sessionId,
        event,
        timestamp: Date.now(),
        eventId: event.id,
        userId: event.userId,
      });
      
      subscriber.ws.send(message);
      subscriber.lastEventTime = Date.now();
    } catch (error) {
      console.error(`[EventStreaming] Failed to deliver event to user ${subscriber.userId}:`, error);
    }
  }
  
  /**
   * Check if an event should be delivered to a user based on their role
   */
  private shouldDeliverEvent(event: OperationEvent, role: UserRole): boolean {
    // Viewers can see all events
    if (role === 'viewer' || role === 'commenter' || role === 'operator') {
      return true;
    }
    
    // Filter sensitive events for limited roles (if needed)
    // For now, allow all events for all roles
    return true;
  }
  
  /**
   * Replay recent events to a new subscriber
   */
  private async replayRecentEvents(
    operationId: string,
    userId: string,
    ws: WebSocket
  ): Promise<void> {
    const subscription = this.subscriptions.get(operationId);
    if (!subscription || subscription.eventBuffer.length === 0) {
      return;
    }
    
    console.log(`[EventStreaming] Replaying ${subscription.eventBuffer.length} events to user ${userId}`);
    
    // Send buffered events
    for (const event of subscription.eventBuffer) {
      try {
        if (ws.readyState === WebSocket.OPEN) {
          const message = JSON.stringify({
            type: 'operation.stream',
            operationId: event.operationId,
            sessionId: event.sessionId,
            event,
            timestamp: Date.now(),
            eventId: event.id,
            userId: event.userId,
            replayed: true,
          });
          ws.send(message);
        }
      } catch (error) {
        console.error(`[EventStreaming] Error replaying event to user ${userId}:`, error);
      }
    }
  }
}

/**
 * Create a new event streaming service
 */
export function createEventStreamingService(
  config: EventStreamingConfig,
  sessionManager: SessionManager,
  eventStore: EventStore
): EventStreamingService {
  return new EventStreamingService(config, sessionManager, eventStore);
}

export default EventStreamingService;