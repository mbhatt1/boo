/**
 * Rate Limiting Service
 * 
 * Provides comprehensive rate limiting with:
 * - Per-user rate limiting (sliding window algorithm)
 * - Per-IP rate limiting
 * - Per-operation rate limiting
 * - Role-based dynamic limits
 * - Redis-backed distributed rate limiting
 * - Exponential backoff on violations
 * - Ban/throttle abusive users
 * 
 * Supports both in-memory and Redis backends for production scalability
 */

import { CollaborationError, CollaborationErrorCode, User } from '../types/index.js';
import type { RedisClient } from '../redis/RedisClient.js';

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  // Default limits
  defaultLimit: number;
  defaultWindowMs: number;
  
  // Role-based limits (requests per window)
  roleLimits: {
    admin: number;
    operator: number;
    analyst: number;
    viewer: number;
  };
  
  // Operation-specific limits
  operationLimits: {
    'message': number;
    'comment.create': number;
    'comment.edit': number;
    'comment.delete': number;
    'session.create': number;
    'heartbeat': number;
  };
  
  // IP-based limits
  ipLimit: number;
  ipWindowMs: number;
  
  // Ban configuration
  maxViolationsBeforeBan: number;
  banDurationMs: number;
  violationDecayMs: number;
  
  // Exponential backoff
  enableBackoff: boolean;
  backoffMultiplier: number;
  maxBackoffMs: number;
}

/**
 * Rate limit result
 */
export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
}

/**
 * Rate limit entry (for in-memory storage)
 */
interface RateLimitEntry {
  count: number;
  resetAt: number;
  violations: number;
  lastViolation: number;
  backoffUntil?: number;
}

/**
 * Default rate limit configuration
 */
const DEFAULT_CONFIG: RateLimitConfig = {
  defaultLimit: 100,
  defaultWindowMs: 60000, // 1 minute
  
  roleLimits: {
    admin: 1000,
    operator: 500,
    analyst: 200,
    viewer: 100,
  },
  
  operationLimits: {
    'message': 60,
    'comment.create': 30,
    'comment.edit': 20,
    'comment.delete': 10,
    'session.create': 5,
    'heartbeat': 120,
  },
  
  ipLimit: 300,
  ipWindowMs: 60000,
  
  maxViolationsBeforeBan: 5,
  banDurationMs: 3600000, // 1 hour
  violationDecayMs: 300000, // 5 minutes
  
  enableBackoff: true,
  backoffMultiplier: 2,
  maxBackoffMs: 300000, // 5 minutes
};

/**
 * Rate Limiter Service
 */
export class RateLimiter {
  private config: RateLimitConfig;
  private redis: RedisClient | null;
  private memoryStore: Map<string, RateLimitEntry>;
  private bannedUsers: Set<string>;
  private bannedIps: Set<string>;

  constructor(config: Partial<RateLimitConfig> = {}, redis?: RedisClient) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.redis = redis || null;
    this.memoryStore = new Map();
    this.bannedUsers = new Set();
    this.bannedIps = new Set();
    
    // Start cleanup interval for memory store
    if (!this.redis) {
      this.startCleanupInterval();
    }
  }

  /**
   * Check rate limit for a user
   */
  async checkUserLimit(
    userId: string,
    role: User['role'],
    operation?: string
  ): Promise<RateLimitResult> {
    // Check if user is banned
    if (this.bannedUsers.has(userId)) {
      throw new CollaborationError(
        CollaborationErrorCode.RATE_LIMIT_EXCEEDED,
        'User is temporarily banned due to repeated violations'
      );
    }

    const limit = this.getUserLimit(role, operation);
    const key = `user:${userId}:${operation || 'default'}`;
    
    return await this.checkLimit(key, limit, this.config.defaultWindowMs, userId);
  }

  /**
   * Check rate limit for an IP address
   */
  async checkIpLimit(ipAddress: string): Promise<RateLimitResult> {
    // Check if IP is banned
    if (this.bannedIps.has(ipAddress)) {
      throw new CollaborationError(
        CollaborationErrorCode.RATE_LIMIT_EXCEEDED,
        'IP address is temporarily banned due to repeated violations'
      );
    }

    const key = `ip:${ipAddress}`;
    return await this.checkLimit(key, this.config.ipLimit, this.config.ipWindowMs, undefined, ipAddress);
  }

  /**
   * Check rate limit for an operation
   */
  async checkOperationLimit(
    userId: string,
    operation: string,
    role: User['role']
  ): Promise<RateLimitResult> {
    const operationLimit = this.config.operationLimits[operation as keyof typeof this.config.operationLimits];
    const limit = operationLimit || this.getUserLimit(role, operation);
    const key = `operation:${operation}:${userId}`;
    
    return await this.checkLimit(key, limit, this.config.defaultWindowMs, userId);
  }

  /**
   * Record a rate limit violation
   */
  async recordViolation(userId: string): Promise<void> {
    const key = `violations:${userId}`;
    
    if (this.redis) {
      await this.recordViolationRedis(key, userId);
    } else {
      this.recordViolationMemory(key, userId);
    }
  }

  /**
   * Ban a user temporarily
   */
  async banUser(userId: string, durationMs?: number): Promise<void> {
    this.bannedUsers.add(userId);
    
    const duration = durationMs || this.config.banDurationMs;
    setTimeout(() => {
      this.bannedUsers.delete(userId);
    }, duration);
    
    if (this.redis) {
      await this.redis.set(`ban:user:${userId}`, '1', Math.floor(duration / 1000));
    }
  }

  /**
   * Ban an IP address temporarily
   */
  async banIp(ipAddress: string, durationMs?: number): Promise<void> {
    this.bannedIps.add(ipAddress);
    
    const duration = durationMs || this.config.banDurationMs;
    setTimeout(() => {
      this.bannedIps.delete(ipAddress);
    }, duration);
    
    if (this.redis) {
      await this.redis.set(`ban:ip:${ipAddress}`, '1', Math.floor(duration / 1000));
    }
  }

  /**
   * Check if a user is banned
   */
  async isUserBanned(userId: string): Promise<boolean> {
    if (this.bannedUsers.has(userId)) {
      return true;
    }
    
    if (this.redis) {
      const banned = await this.redis.get(`ban:user:${userId}`);
      return banned !== null;
    }
    
    return false;
  }

  /**
   * Check if an IP is banned
   */
  async isIpBanned(ipAddress: string): Promise<boolean> {
    if (this.bannedIps.has(ipAddress)) {
      return true;
    }
    
    if (this.redis) {
      const banned = await this.redis.get(`ban:ip:${ipAddress}`);
      return banned !== null;
    }
    
    return false;
  }

  /**
   * Reset rate limit for a key
   */
  async resetLimit(key: string): Promise<void> {
    if (this.redis) {
      await this.redis.del(`ratelimit:${key}`);
    } else {
      this.memoryStore.delete(key);
    }
  }

  /**
   * Get current usage for a key
   */
  async getUsage(key: string): Promise<{ count: number; limit: number; resetAt: number } | null> {
    if (this.redis) {
      return await this.getUsageRedis(key);
    } else {
      return this.getUsageMemory(key);
    }
  }

  /**
   * Internal: Check limit implementation
   */
  private async checkLimit(
    key: string,
    limit: number,
    windowMs: number,
    userId?: string,
    ipAddress?: string
  ): Promise<RateLimitResult> {
    if (this.redis) {
      return await this.checkLimitRedis(key, limit, windowMs, userId, ipAddress);
    } else {
      return this.checkLimitMemory(key, limit, windowMs, userId, ipAddress);
    }
  }

  /**
   * Redis-backed rate limit check (sliding window)
   * Simplified implementation using Redis sorted sets
   */
  private async checkLimitRedis(
    key: string,
    limit: number,
    windowMs: number,
    userId?: string,
    ipAddress?: string
  ): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = now - windowMs;
    const redisKey = `ratelimit:${key}`;
    
    // Get current count using zrange (get all entries in window)
    const entries = await this.redis!.zrange(redisKey, 0, -1);
    
    // Filter entries within window (since we can't use zRemRangeByScore)
    const validEntries = entries.filter((entry: string) => {
      const timestamp = parseInt(entry.split(':')[0]);
      return timestamp > windowStart;
    });
    
    const count = validEntries.length;
    
    // Add new entry if within limit
    const entryId = `${now}:${Math.random()}`;
    await this.redis!.zadd(redisKey, now, entryId);
    
    // Store TTL info separately since we can't use expire
    await this.redis!.set(`${redisKey}:ttl`, (now + windowMs).toString(), Math.ceil(windowMs / 1000));
    
    const resetAt = now + windowMs;
    const remaining = Math.max(0, limit - count - 1);
    const allowed = count < limit;
    
    if (!allowed) {
      // Record violation
      if (userId) {
        await this.recordViolation(userId);
      }
      
      // Calculate retry after with exponential backoff
      const retryAfter = this.calculateRetryAfter(key, windowMs);
      
      return {
        allowed: false,
        limit,
        remaining: 0,
        resetAt,
        retryAfter,
      };
    }
    
    return {
      allowed: true,
      limit,
      remaining,
      resetAt,
    };
  }

  /**
   * Memory-backed rate limit check (sliding window)
   */
  private checkLimitMemory(
    key: string,
    limit: number,
    windowMs: number,
    userId?: string,
    ipAddress?: string
  ): RateLimitResult {
    const now = Date.now();
    let entry = this.memoryStore.get(key);
    
    // Check if entry exists and is valid
    if (!entry || entry.resetAt <= now) {
      entry = {
        count: 0,
        resetAt: now + windowMs,
        violations: 0,
        lastViolation: 0,
      };
    }
    
    // Check backoff period
    if (entry.backoffUntil && entry.backoffUntil > now) {
      return {
        allowed: false,
        limit,
        remaining: 0,
        resetAt: entry.resetAt,
        retryAfter: entry.backoffUntil - now,
      };
    }
    
    const remaining = Math.max(0, limit - entry.count - 1);
    const allowed = entry.count < limit;
    
    if (!allowed) {
      // Record violation
      entry.violations++;
      entry.lastViolation = now;
      
      // Apply exponential backoff
      if (this.config.enableBackoff) {
        const backoffMs = Math.min(
          windowMs * Math.pow(this.config.backoffMultiplier, entry.violations - 1),
          this.config.maxBackoffMs
        );
        entry.backoffUntil = now + backoffMs;
      }
      
      // Check if should ban
      if (entry.violations >= this.config.maxViolationsBeforeBan) {
        if (userId) {
          this.banUser(userId).catch(console.error);
        }
        if (ipAddress) {
          this.banIp(ipAddress).catch(console.error);
        }
      }
      
      this.memoryStore.set(key, entry);
      
      return {
        allowed: false,
        limit,
        remaining: 0,
        resetAt: entry.resetAt,
        retryAfter: entry.backoffUntil ? entry.backoffUntil - now : windowMs,
      };
    }
    
    // Increment count
    entry.count++;
    
    // Decay violations over time
    if (entry.lastViolation && now - entry.lastViolation > this.config.violationDecayMs) {
      entry.violations = Math.max(0, entry.violations - 1);
    }
    
    this.memoryStore.set(key, entry);
    
    return {
      allowed: true,
      limit,
      remaining,
      resetAt: entry.resetAt,
    };
  }

  /**
   * Record violation in Redis
   */
  private async recordViolationRedis(key: string, userId: string): Promise<void> {
    const now = Date.now();
    const violationKey = `${key}`;
    
    // Add violation record
    await this.redis!.zadd(violationKey, now, now.toString());
    
    // Store TTL
    await this.redis!.set(`${violationKey}:ttl`, (now + this.config.violationDecayMs).toString(),
      Math.ceil(this.config.violationDecayMs / 1000));
    
    // Get all violations and filter by window
    const violations = await this.redis!.zrange(violationKey, 0, -1);
    const windowStart = now - this.config.violationDecayMs;
    
    const validViolations = violations.filter((v: string) => {
      const timestamp = parseInt(v);
      return timestamp > windowStart;
    });
    
    const violationCount = validViolations.length;
    
    if (violationCount >= this.config.maxViolationsBeforeBan) {
      await this.banUser(userId);
    }
  }

  /**
   * Record violation in memory
   */
  private recordViolationMemory(key: string, userId: string): void {
    let entry = this.memoryStore.get(key);
    const now = Date.now();
    
    if (!entry) {
      entry = {
        count: 0,
        resetAt: now + this.config.defaultWindowMs,
        violations: 1,
        lastViolation: now,
      };
    } else {
      entry.violations++;
      entry.lastViolation = now;
      
      // Decay old violations
      if (now - entry.lastViolation > this.config.violationDecayMs) {
        entry.violations = Math.max(0, entry.violations - 1);
      }
    }
    
    this.memoryStore.set(key, entry);
    
    if (entry.violations >= this.config.maxViolationsBeforeBan) {
      this.banUser(userId).catch(console.error);
    }
  }

  /**
   * Calculate retry after time with exponential backoff
   */
  private calculateRetryAfter(key: string, baseWindowMs: number): number {
    const entry = this.memoryStore.get(key);
    if (!entry || !this.config.enableBackoff) {
      return baseWindowMs;
    }
    
    const backoffMs = Math.min(
      baseWindowMs * Math.pow(this.config.backoffMultiplier, entry.violations),
      this.config.maxBackoffMs
    );
    
    return backoffMs;
  }

  /**
   * Get user limit based on role and operation
   */
  private getUserLimit(role: User['role'], operation?: string): number {
    if (operation && this.config.operationLimits[operation as keyof typeof this.config.operationLimits]) {
      return this.config.operationLimits[operation as keyof typeof this.config.operationLimits];
    }
    
    return this.config.roleLimits[role] || this.config.defaultLimit;
  }

  /**
   * Get usage from Redis
   */
  private async getUsageRedis(key: string): Promise<{ count: number; limit: number; resetAt: number } | null> {
    const redisKey = `ratelimit:${key}`;
    const entries = await this.redis!.zrange(redisKey, 0, -1);
    const ttlStr = await this.redis!.get(`${redisKey}:ttl`);
    
    if (!ttlStr) {
      return null;
    }
    
    const resetAt = parseInt(ttlStr);
    if (resetAt <= Date.now()) {
      return null;
    }
    
    return {
      count: entries.length,
      limit: this.config.defaultLimit,
      resetAt,
    };
  }

  /**
   * Get usage from memory
   */
  private getUsageMemory(key: string): { count: number; limit: number; resetAt: number } | null {
    const entry = this.memoryStore.get(key);
    if (!entry) {
      return null;
    }
    
    return {
      count: entry.count,
      limit: this.config.defaultLimit,
      resetAt: entry.resetAt,
    };
  }

  /**
   * Start cleanup interval for expired entries
   */
  private startCleanupInterval(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.memoryStore.entries()) {
        if (entry.resetAt <= now) {
          this.memoryStore.delete(key);
        }
      }
    }, 60000); // Cleanup every minute
  }

  /**
   * Get rate limit headers for HTTP responses
   */
  getRateLimitHeaders(result: RateLimitResult): Record<string, string> {
    return {
      'X-RateLimit-Limit': result.limit.toString(),
      'X-RateLimit-Remaining': result.remaining.toString(),
      'X-RateLimit-Reset': new Date(result.resetAt).toISOString(),
      ...(result.retryAfter ? { 'Retry-After': Math.ceil(result.retryAfter / 1000).toString() } : {}),
    };
  }

  /**
   * Shutdown and cleanup
   */
  async close(): Promise<void> {
    this.memoryStore.clear();
    this.bannedUsers.clear();
    this.bannedIps.clear();
  }
}

/**
 * Singleton instance
 */
let rateLimiterInstance: RateLimiter | null = null;

export function getRateLimiter(
  config?: Partial<RateLimitConfig>,
  redis?: RedisClient
): RateLimiter {
  if (!rateLimiterInstance) {
    rateLimiterInstance = new RateLimiter(config, redis);
  }
  return rateLimiterInstance;
}

export function resetRateLimiter(): void {
  if (rateLimiterInstance) {
    rateLimiterInstance.close();
  }
  rateLimiterInstance = null;
}

export default RateLimiter;