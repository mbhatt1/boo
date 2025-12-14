/**
 * Test Redis Utilities
 * 
 * Helper functions for test Redis operations
 */

import Redis from 'ioredis';

let testRedis: Redis | null = null;

/**
 * Get or create test Redis client
 */
export function getTestRedis(): Redis {
  if (!testRedis) {
    testRedis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      db: 1, // Use database 1 for tests
      retryStrategy: (times) => {
        if (times > 3) {
          return null; // Stop retrying
        }
        return Math.min(times * 50, 2000);
      },
    });
    
    testRedis.on('error', (error) => {
      console.error('Test Redis error:', error);
    });
  }
  return testRedis;
}

/**
 * Close test Redis client
 */
export async function closeTestRedis(): Promise<void> {
  if (testRedis) {
    await testRedis.quit();
    testRedis = null;
  }
}

/**
 * Clear all test data from Redis
 */
export async function clearTestRedisData(): Promise<void> {
  const redis = getTestRedis();
  await redis.flushdb();
}

/**
 * Set value with automatic serialization
 */
export async function setTestValue(
  key: string,
  value: any,
  expirySeconds?: number
): Promise<void> {
  const redis = getTestRedis();
  const serialized = JSON.stringify(value);
  
  if (expirySeconds) {
    await redis.setex(key, expirySeconds, serialized);
  } else {
    await redis.set(key, serialized);
  }
}

/**
 * Get value with automatic deserialization
 */
export async function getTestValue<T = any>(key: string): Promise<T | null> {
  const redis = getTestRedis();
  const value = await redis.get(key);
  
  if (!value) {
    return null;
  }
  
  try {
    return JSON.parse(value) as T;
  } catch {
    return value as any;
  }
}

/**
 * Check if Redis is available
 */
export async function isRedisAvailable(): Promise<boolean> {
  try {
    const redis = getTestRedis();
    await redis.ping();
    return true;
  } catch {
    return false;
  }
}

/**
 * Seed test Redis data
 */
export async function seedTestRedisData(): Promise<void> {
  const redis = getTestRedis();
  
  // Example: Set some test session data
  await redis.hset('sessions:active', 'session_1', JSON.stringify({
    id: 'session_1',
    paper_id: 'paper_1',
    participants: 2,
  }));
  
  // Example: Set some presence data
  await redis.setex(
    'presence:user_1',
    300,
    JSON.stringify({
      userId: 'user_1',
      status: 'online',
      lastSeen: Date.now(),
    })
  );
}

/**
 * Get all keys matching pattern
 */
export async function getTestKeys(pattern: string): Promise<string[]> {
  const redis = getTestRedis();
  return redis.keys(pattern);
}

/**
 * Delete keys matching pattern
 */
export async function deleteTestKeys(pattern: string): Promise<number> {
  const redis = getTestRedis();
  const keys = await redis.keys(pattern);
  
  if (keys.length === 0) {
    return 0;
  }
  
  return redis.del(...keys);
}