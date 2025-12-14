/**
 * Connection Pool Manager
 * 
 * Manages PostgreSQL and Redis connection pools with health checks,
 * automatic reconnection, and pool statistics
 */

import { Pool, PoolClient, PoolConfig } from 'pg';
import Redis, { RedisOptions, Cluster } from 'ioredis';

export interface ConnectionPoolConfig {
  postgres: PoolConfig;
  redis: RedisOptions;
  healthCheckInterval?: number; // ms
  reconnectDelay?: number; // ms
  maxReconnectAttempts?: number;
}

export interface PoolStatistics {
  postgres: {
    total: number;
    idle: number;
    waiting: number;
    active: number;
  };
  redis: {
    status: string;
    connectedClients: number;
  };
}

/**
 * ConnectionPool - Manages database connection pools
 */
export class ConnectionPool {
  private pgPool: Pool;
  private redisClient: Redis;
  private healthCheckInterval?: NodeJS.Timeout;
  private reconnecting: boolean = false;
  
  private config: Required<ConnectionPoolConfig>;
  
  // Statistics
  private pgStats = {
    totalConnections: 0,
    errors: 0,
    reconnects: 0,
  };
  
  private redisStats = {
    totalCommands: 0,
    errors: 0,
    reconnects: 0,
  };

  constructor(config: ConnectionPoolConfig) {
    this.config = {
      ...config,
      healthCheckInterval: config.healthCheckInterval || 30000,
      reconnectDelay: config.reconnectDelay || 1000,
      maxReconnectAttempts: config.maxReconnectAttempts || 10,
    };
    
    // Initialize PostgreSQL pool
    this.pgPool = new Pool({
      ...this.config.postgres,
      min: this.config.postgres.min || 10,
      max: this.config.postgres.max || 100,
      idleTimeoutMillis: this.config.postgres.idleTimeoutMillis || 30000,
      connectionTimeoutMillis: this.config.postgres.connectionTimeoutMillis || 5000,
    });
    
    // Set up PostgreSQL event handlers
    this.pgPool.on('connect', () => {
      this.pgStats.totalConnections++;
      console.log('[ConnectionPool] PostgreSQL client connected');
    });
    
    this.pgPool.on('error', (err, client) => {
      this.pgStats.errors++;
      console.error('[ConnectionPool] PostgreSQL error:', err);
      this.handlePostgresError(err);
    });
    
    this.pgPool.on('remove', () => {
      console.log('[ConnectionPool] PostgreSQL client removed');
    });
    
    // Initialize Redis client
    this.redisClient = new Redis({
      ...this.config.redis,
      retryStrategy: (times) => {
        if (times > this.config.maxReconnectAttempts) {
          console.error('[ConnectionPool] Redis max reconnect attempts reached');
          return null;
        }
        return this.config.reconnectDelay * times;
      },
      reconnectOnError: (err) => {
        console.log('[ConnectionPool] Redis reconnecting on error:', err.message);
        return true;
      },
    });
    
    // Set up Redis event handlers
    this.redisClient.on('connect', () => {
      console.log('[ConnectionPool] Redis connected');
      this.reconnecting = false;
    });
    
    this.redisClient.on('ready', () => {
      console.log('[ConnectionPool] Redis ready');
    });
    
    this.redisClient.on('error', (err) => {
      this.redisStats.errors++;
      console.error('[ConnectionPool] Redis error:', err);
    });
    
    this.redisClient.on('reconnecting', () => {
      this.redisStats.reconnects++;
      this.reconnecting = true;
      console.log('[ConnectionPool] Redis reconnecting...');
    });
    
    this.redisClient.on('end', () => {
      console.log('[ConnectionPool] Redis connection ended');
    });
  }

  /**
   * Start health checks
   */
  startHealthChecks(): void {
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, this.config.healthCheckInterval);
    
    console.log('[ConnectionPool] Health checks started');
  }

  /**
   * Stop health checks
   */
  stopHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
      console.log('[ConnectionPool] Health checks stopped');
    }
  }

  /**
   * Get PostgreSQL client from pool
   */
  async getPostgresClient(): Promise<PoolClient> {
    try {
      const client = await this.pgPool.connect();
      return client;
    } catch (error) {
      this.pgStats.errors++;
      throw new Error(`Failed to get PostgreSQL client: ${(error as Error).message}`);
    }
  }

  /**
   * Execute PostgreSQL query
   */
  async query<T = any>(text: string, params?: any[]): Promise<{ rows: T[]; rowCount: number }> {
    try {
      return await this.pgPool.query(text, params);
    } catch (error) {
      this.pgStats.errors++;
      throw error;
    }
  }

  /**
   * Get Redis client
   */
  getRedisClient(): Redis {
    return this.redisClient;
  }

  /**
   * Execute Redis command
   */
  async redisCommand<T = any>(command: string, ...args: any[]): Promise<T> {
    try {
      this.redisStats.totalCommands++;
      return await (this.redisClient as any)[command](...args);
    } catch (error) {
      this.redisStats.errors++;
      throw error;
    }
  }

  /**
   * Perform health check
   */
  private async performHealthCheck(): Promise<void> {
    // Check PostgreSQL
    try {
      await this.pgPool.query('SELECT 1');
      console.log('[ConnectionPool] PostgreSQL health check: OK');
    } catch (error) {
      console.error('[ConnectionPool] PostgreSQL health check failed:', error);
      await this.handlePostgresError(error as Error);
    }
    
    // Check Redis
    try {
      await this.redisClient.ping();
      console.log('[ConnectionPool] Redis health check: OK');
    } catch (error) {
      console.error('[ConnectionPool] Redis health check failed:', error);
    }
  }

  /**
   * Handle PostgreSQL errors and attempt recovery
   */
  private async handlePostgresError(error: Error): Promise<void> {
    const errorMessage = error.message.toLowerCase();
    
    // Check if error requires reconnection
    if (
      errorMessage.includes('connection') ||
      errorMessage.includes('timeout') ||
      errorMessage.includes('econnrefused')
    ) {
      console.log('[ConnectionPool] Attempting PostgreSQL reconnection...');
      this.pgStats.reconnects++;
      
      // Pool will automatically attempt to reconnect
      // We just log the attempt
    }
  }

  /**
   * Get pool statistics
   */
  getStatistics(): PoolStatistics & { pgStats: typeof this.pgStats; redisStats: typeof this.redisStats } {
    return {
      postgres: {
        total: this.pgPool.totalCount,
        idle: this.pgPool.idleCount,
        waiting: this.pgPool.waitingCount,
        active: this.pgPool.totalCount - this.pgPool.idleCount,
      },
      redis: {
        status: this.redisClient.status,
        connectedClients: this.reconnecting ? 0 : 1,
      },
      pgStats: { ...this.pgStats },
      redisStats: { ...this.redisStats },
    };
  }

  /**
   * Check if pools are healthy
   */
  isHealthy(): boolean {
    const pgHealthy = this.pgPool.totalCount > 0 && this.pgPool.idleCount >= 0;
    const redisHealthy = this.redisClient.status === 'ready' && !this.reconnecting;
    
    return pgHealthy && redisHealthy;
  }

  /**
   * Get pool utilization percentage
   */
  getUtilization(): { postgres: number; redis: number } {
    const pgMax = this.config.postgres.max || 100;
    const pgUtil = ((this.pgPool.totalCount - this.pgPool.idleCount) / pgMax) * 100;
    
    return {
      postgres: Math.min(pgUtil, 100),
      redis: this.reconnecting ? 0 : 100,
    };
  }

  /**
   * Close all connections
   */
  async close(): Promise<void> {
    this.stopHealthChecks();
    
    // Close PostgreSQL pool
    try {
      await this.pgPool.end();
      console.log('[ConnectionPool] PostgreSQL pool closed');
    } catch (error) {
      console.error('[ConnectionPool] Error closing PostgreSQL pool:', error);
    }
    
    // Close Redis client
    try {
      await this.redisClient.quit();
      console.log('[ConnectionPool] Redis client closed');
    } catch (error) {
      console.error('[ConnectionPool] Error closing Redis client:', error);
    }
  }

  /**
   * Drain PostgreSQL pool (wait for active clients)
   */
  async drain(): Promise<void> {
    console.log('[ConnectionPool] Draining PostgreSQL pool...');
    
    // Wait for all active connections to be released
    const maxWait = 30000; // 30 seconds
    const startTime = Date.now();
    
    while (this.pgPool.totalCount > this.pgPool.idleCount) {
      if (Date.now() - startTime > maxWait) {
        console.warn('[ConnectionPool] Drain timeout reached, forcing close');
        break;
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log('[ConnectionPool] PostgreSQL pool drained');
  }

  /**
   * Reset statistics
   */
  resetStatistics(): void {
    this.pgStats = {
      totalConnections: 0,
      errors: 0,
      reconnects: 0,
    };
    
    this.redisStats = {
      totalCommands: 0,
      errors: 0,
      reconnects: 0,
    };
  }
}

/**
 * Create connection pool instance
 */
export function createConnectionPool(config: ConnectionPoolConfig): ConnectionPool {
  return new ConnectionPool(config);
}