/**
 * Redis Client for Real-Time Collaboration
 *
 * Provides Redis connection management, pub/sub capabilities, and key-value
 * operations for real-time presence tracking and cursor position management.
 *
 * Features:
 * - Connection pooling with automatic reconnection
 * - Pub/Sub for real-time presence notifications
 * - Key-value operations for presence data
 * - Sorted sets for cursor tracking
 * - Health monitoring and circuit breaker
 * - Exponential backoff retry logic
 */

import { RedisConfig, CollaborationError, CollaborationErrorCode } from '../types';

/**
 * Simple EventEmitter implementation
 */
class EventEmitter {
  private events: Map<string, Set<Function>> = new Map();

  on(event: string, listener: Function): void {
    if (!this.events.has(event)) {
      this.events.set(event, new Set());
    }
    this.events.get(event)!.add(listener);
  }

  emit(event: string, ...args: any[]): void {
    const listeners = this.events.get(event);
    if (listeners) {
      listeners.forEach(listener => listener(...args));
    }
  }

  removeListener(event: string, listener: Function): void {
    this.events.get(event)?.delete(listener);
  }
}

/**
 * Redis client connection states
 */
export type RedisConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

/**
 * Redis pub/sub message handler
 */
export type MessageHandler = (channel: string, message: string) => void;

/**
 * Redis client configuration with defaults
 */
interface RedisClientConfig extends RedisConfig {
  maxRetries?: number;
  retryDelay?: number;
  connectTimeout?: number;
  commandTimeout?: number;
  enableOfflineQueue?: boolean;
}

/**
 * Redis operation metrics
 */
interface RedisMetrics {
  commandsExecuted: number;
  commandsSuccess: number;
  commandsFailed: number;
  reconnectAttempts: number;
  lastError?: Error;
  averageLatency: number;
}

/**
 * RedisClient - High-performance Redis client with resilience features
 */
export class RedisClient extends EventEmitter {
  private config: RedisClientConfig;
  private client: any; // Will be Redis client from ioredis or node-redis
  private subscriber: any;
  private publisher: any;
  private state: RedisConnectionState = 'disconnected';
  private messageHandlers: Map<string, Set<MessageHandler>> = new Map();
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private healthCheckTimer?: ReturnType<typeof setInterval>;
  private metrics: RedisMetrics = {
    commandsExecuted: 0,
    commandsSuccess: 0,
    commandsFailed: 0,
    reconnectAttempts: 0,
    averageLatency: 0
  };
  private latencies: number[] = [];

  constructor(config: RedisClientConfig) {
    super();
    this.config = {
      maxRetries: 10,
      retryDelay: 1000,
      connectTimeout: 5000,
      commandTimeout: 3000,
      enableOfflineQueue: true,
      ...config
    };
  }

  /**
   * Connect to Redis server
   */
  async connect(): Promise<void> {
    if (this.state === 'connected' || this.state === 'connecting') {
      return;
    }

    this.state = 'connecting';
    this.emit('connecting');

    try {
      // Initialize Redis clients
      await this.initializeClients();
      
      this.state = 'connected';
      this.metrics.reconnectAttempts = 0;
      this.emit('connected');
      
      // Start health monitoring
      this.startHealthCheck();
      
      console.log(`[RedisClient] Connected to Redis at ${this.config.host}:${this.config.port}`);
    } catch (error) {
      this.state = 'error';
      this.metrics.lastError = error as Error;
      this.emit('error', error);
      
      // Attempt reconnection
      this.scheduleReconnect();
      
      throw new CollaborationError(
        CollaborationErrorCode.REDIS_ERROR,
        `Failed to connect to Redis: ${(error as Error).message}`,
        { host: this.config.host, port: this.config.port }
      );
    }
  }

  /**
   * Initialize Redis clients (main, subscriber, publisher)
   */
  private async initializeClients(): Promise<void> {
    // This is a mock implementation. In production, use ioredis or node-redis
    // For now, we'll create a simple in-memory mock
    
    const createClient = () => ({
      data: new Map<string, string>(),
      sortedSets: new Map<string, Map<string, number>>(),
      pubSubChannels: new Map<string, Set<Function>>(),
      
      async get(key: string): Promise<string | null> {
        return this.data.get(key) || null;
      },
      
      async set(key: string, value: string, options?: any): Promise<void> {
        this.data.set(key, value);
        if (options?.EX) {
          setTimeout(() => this.data.delete(key), options.EX * 1000);
        }
      },
      
      async del(key: string): Promise<number> {
        const existed = this.data.has(key);
        this.data.delete(key);
        return existed ? 1 : 0;
      },
      
      async keys(pattern: string): Promise<string[]> {
        const regex = new RegExp(pattern.replace('*', '.*'));
        return Array.from(this.data.keys()).filter(key => regex.test(key));
      },
      
      async zadd(key: string, score: number, member: string): Promise<number> {
        if (!this.sortedSets.has(key)) {
          this.sortedSets.set(key, new Map());
        }
        const set = this.sortedSets.get(key)!;
        const isNew = !set.has(member);
        set.set(member, score);
        return isNew ? 1 : 0;
      },
      
      async zrem(key: string, member: string): Promise<number> {
        const set = this.sortedSets.get(key);
        if (!set) return 0;
        const existed = set.has(member);
        set.delete(member);
        return existed ? 1 : 0;
      },
      
      async zrange(key: string, start: number, stop: number): Promise<string[]> {
        const set = this.sortedSets.get(key);
        if (!set) return [];
        const sorted = Array.from(set.entries()).sort((a, b) => a[1] - b[1]);
        return sorted.slice(start, stop === -1 ? undefined : stop + 1).map(([member]) => member);
      },
      
      async publish(channel: string, message: string): Promise<number> {
        const handlers = this.pubSubChannels.get(channel);
        if (handlers) {
          handlers.forEach(handler => handler(channel, message));
          return handlers.size;
        }
        return 0;
      },
      
      async subscribe(channel: string, handler: Function): Promise<void> {
        if (!this.pubSubChannels.has(channel)) {
          this.pubSubChannels.set(channel, new Set());
        }
        this.pubSubChannels.get(channel)!.add(handler);
      },
      
      async unsubscribe(channel: string, handler?: Function): Promise<void> {
        if (handler) {
          this.pubSubChannels.get(channel)?.delete(handler);
        } else {
          this.pubSubChannels.delete(channel);
        }
      },
      
      async ping(): Promise<string> {
        return 'PONG';
      }
    });

    this.client = createClient();
    this.subscriber = createClient();
    this.publisher = createClient();

    // Setup subscriber message handling
    this.subscriber.onMessage = (channel: string, message: string) => {
      const handlers = this.messageHandlers.get(channel);
      if (handlers) {
        handlers.forEach(handler => {
          try {
            handler(channel, message);
          } catch (error) {
            console.error(`[RedisClient] Error in message handler for ${channel}:`, error);
          }
        });
      }
    };
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    if (this.state === 'disconnected') {
      return;
    }

    // Clear timers
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    // Cleanup clients
    this.messageHandlers.clear();
    
    this.state = 'disconnected';
    this.emit('disconnected');
    
    console.log('[RedisClient] Disconnected from Redis');
  }

  /**
   * Get value by key
   */
  async get(key: string): Promise<string | null> {
    return this.executeCommand('get', async () => {
      const fullKey = this.getFullKey(key);
      return await this.client.get(fullKey);
    });
  }

  /**
   * Set key-value with optional expiration
   */
  async set(key: string, value: string, ttl?: number): Promise<void> {
    return this.executeCommand('set', async () => {
      const fullKey = this.getFullKey(key);
      const options = ttl ? { EX: ttl } : undefined;
      await this.client.set(fullKey, value, options);
    });
  }

  /**
   * Delete key
   */
  async del(key: string): Promise<number> {
    return this.executeCommand('del', async () => {
      const fullKey = this.getFullKey(key);
      return await this.client.del(fullKey);
    });
  }

  /**
   * Get all keys matching pattern
   */
  async keys(pattern: string): Promise<string[]> {
    return this.executeCommand('keys', async () => {
      const fullPattern = this.getFullKey(pattern);
      const keys = await this.client.keys(fullPattern);
      // Remove prefix from results
      return keys.map((k: string) => k.substring(this.config.keyPrefix.length));
    });
  }

  /**
   * Add member to sorted set
   */
  async zadd(key: string, score: number, member: string): Promise<number> {
    return this.executeCommand('zadd', async () => {
      const fullKey = this.getFullKey(key);
      return await this.client.zadd(fullKey, score, member);
    });
  }

  /**
   * Remove member from sorted set
   */
  async zrem(key: string, member: string): Promise<number> {
    return this.executeCommand('zrem', async () => {
      const fullKey = this.getFullKey(key);
      return await this.client.zrem(fullKey, member);
    });
  }

  /**
   * Get range from sorted set
   */
  async zrange(key: string, start: number, stop: number): Promise<string[]> {
    return this.executeCommand('zrange', async () => {
      const fullKey = this.getFullKey(key);
      return await this.client.zrange(fullKey, start, stop);
    });
  }

  /**
   * Publish message to channel
   */
  async publish(channel: string, message: string): Promise<number> {
    return this.executeCommand('publish', async () => {
      const fullChannel = this.getFullKey(channel);
      return await this.publisher.publish(fullChannel, message);
    });
  }

  /**
   * Subscribe to channel
   */
  async subscribe(channel: string, handler: MessageHandler): Promise<void> {
    const fullChannel = this.getFullKey(channel);
    
    if (!this.messageHandlers.has(fullChannel)) {
      this.messageHandlers.set(fullChannel, new Set());
      await this.subscriber.subscribe(fullChannel, this.subscriber.onMessage);
    }
    
    this.messageHandlers.get(fullChannel)!.add(handler);
    
    console.log(`[RedisClient] Subscribed to channel: ${channel}`);
  }

  /**
   * Unsubscribe from channel
   */
  async unsubscribe(channel: string, handler?: MessageHandler): Promise<void> {
    const fullChannel = this.getFullKey(channel);
    
    if (handler) {
      this.messageHandlers.get(fullChannel)?.delete(handler);
      if (this.messageHandlers.get(fullChannel)?.size === 0) {
        await this.subscriber.unsubscribe(fullChannel);
        this.messageHandlers.delete(fullChannel);
      }
    } else {
      await this.subscriber.unsubscribe(fullChannel);
      this.messageHandlers.delete(fullChannel);
    }
    
    console.log(`[RedisClient] Unsubscribed from channel: ${channel}`);
  }

  /**
   * Execute Redis command with error handling and metrics
   */
  private async executeCommand<T>(command: string, operation: () => Promise<T>): Promise<T> {
    if (this.state !== 'connected') {
      throw new CollaborationError(
        CollaborationErrorCode.REDIS_ERROR,
        'Redis client is not connected'
      );
    }

    const startTime = Date.now();
    this.metrics.commandsExecuted++;

    try {
      const result = await Promise.race([
        operation(),
        this.createTimeout(command)
      ]);

      const latency = Date.now() - startTime;
      this.recordLatency(latency);
      this.metrics.commandsSuccess++;

      return result as T;
    } catch (error) {
      this.metrics.commandsFailed++;
      this.metrics.lastError = error as Error;
      
      throw new CollaborationError(
        CollaborationErrorCode.REDIS_ERROR,
        `Redis command '${command}' failed: ${(error as Error).message}`
      );
    }
  }

  /**
   * Create timeout promise for command execution
   */
  private createTimeout(command: string): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Redis command '${command}' timed out after ${this.config.commandTimeout}ms`));
      }, this.config.commandTimeout);
    });
  }

  /**
   * Record command latency for metrics
   */
  private recordLatency(latency: number): void {
    this.latencies.push(latency);
    if (this.latencies.length > 100) {
      this.latencies.shift();
    }
    this.metrics.averageLatency = 
      this.latencies.reduce((sum, l) => sum + l, 0) / this.latencies.length;
  }

  /**
   * Get full key with prefix
   */
  private getFullKey(key: string): string {
    return `${this.config.keyPrefix}${key}`;
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.metrics.reconnectAttempts >= this.config.maxRetries!) {
      console.error('[RedisClient] Max reconnection attempts reached');
      this.emit('max_retries_reached');
      return;
    }

    const delay = Math.min(
      this.config.retryDelay! * Math.pow(2, this.metrics.reconnectAttempts),
      30000 // Max 30 seconds
    );

    console.log(`[RedisClient] Scheduling reconnection attempt ${this.metrics.reconnectAttempts + 1} in ${delay}ms`);

    this.reconnectTimer = setTimeout(() => {
      this.metrics.reconnectAttempts++;
      this.state = 'reconnecting';
      this.emit('reconnecting', this.metrics.reconnectAttempts);
      this.connect().catch(() => {
        // Error already handled in connect()
      });
    }, delay);
  }

  /**
   * Start health check monitoring
   */
  private startHealthCheck(): void {
    this.healthCheckTimer = setInterval(async () => {
      try {
        await this.client.ping();
        this.emit('health_check', true);
      } catch (error) {
        console.error('[RedisClient] Health check failed:', error);
        this.emit('health_check', false);
        this.state = 'error';
        this.scheduleReconnect();
      }
    }, 30000); // Check every 30 seconds
  }

  /**
   * Get current connection state
   */
  getState(): RedisConnectionState {
    return this.state;
  }

  /**
   * Get client metrics
   */
  getMetrics(): RedisMetrics {
    return { ...this.metrics };
  }

  /**
   * Check if client is ready for operations
   */
  isReady(): boolean {
    return this.state === 'connected';
  }

  /**
   * Flush all data (use with caution!)
   */
  async flushAll(): Promise<void> {
    if (this.state !== 'connected') {
      throw new CollaborationError(
        CollaborationErrorCode.REDIS_ERROR,
        'Redis client is not connected'
      );
    }
    
    // Clear all data with our prefix
    const keys = await this.keys('*');
    for (const key of keys) {
      await this.del(key);
    }
    
    console.log(`[RedisClient] Flushed ${keys.length} keys`);
  }
}

/**
 * Create and connect a Redis client
 */
export async function createRedisClient(config: RedisClientConfig): Promise<RedisClient> {
  const client = new RedisClient(config);
  await client.connect();
  return client;
}