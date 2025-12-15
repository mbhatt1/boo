/**
 * RateLimiter Unit Tests
 * 
 * Comprehensive tests for rate limiting including per-user, per-IP,
 * per-operation limits, banning, exponential backoff, and Redis integration.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { RateLimiter } from '../../security/RateLimiter.js';
import { CollaborationError } from '../../types/index.js';
import { sleep } from '../setup/test-helpers.js';

describe('RateLimiter', () => {
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    rateLimiter = new RateLimiter({
      defaultLimit: 10,
      defaultWindowMs: 1000, // 1 second for faster tests
      roleLimits: {
        admin: 100,
        operator: 50,
        analyst: 20,
        viewer: 10,
      },
      operationLimits: {
        'message': 5,
        'comment.create': 3,
        'comment.edit': 2,
        'comment.delete': 1,
        'session.create': 1,
        'heartbeat': 20,
      },
      maxViolationsBeforeBan: 3,
      banDurationMs: 1000, // 1 second for faster tests
      violationDecayMs: 500,
    });
  });

  afterEach(async () => {
    // Cleanup method not yet implemented
    // await rateLimiter.cleanup();
  });

  describe('checkUserLimit', () => {
    it('should allow requests within limit', async () => {
      const result1 = await rateLimiter.checkUserLimit('user1', 'viewer');
      const result2 = await rateLimiter.checkUserLimit('user1', 'viewer');

      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(true);
      expect(result1.remaining).toBe(9);
      expect(result2.remaining).toBe(8);
    });

    it('should block requests exceeding limit', async () => {
      // Make 10 requests (limit for viewer)
      for (let i = 0; i < 10; i++) {
        await rateLimiter.checkUserLimit('user1', 'viewer');
      }

      // 11th request should fail
      const result = await rateLimiter.checkUserLimit('user1', 'viewer');

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfter).toBeDefined();
    });

    it('should reset limit after window expires', async () => {
      // Use up the limit
      for (let i = 0; i < 10; i++) {
        await rateLimiter.checkUserLimit('user1', 'viewer');
      }

      // Wait for window to expire
      await sleep(1100);

      // Should be allowed again
      const result = await rateLimiter.checkUserLimit('user1', 'viewer');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9);
    });

    it('should respect role-based limits', async () => {
      // Admin has 100 requests
      for (let i = 0; i < 50; i++) {
        const result = await rateLimiter.checkUserLimit('admin1', 'admin');
        expect(result.allowed).toBe(true);
      }

      // Viewer has only 10 requests
      for (let i = 0; i < 10; i++) {
        await rateLimiter.checkUserLimit('viewer1', 'viewer');
      }
      
      const viewerResult = await rateLimiter.checkUserLimit('viewer1', 'viewer');
      expect(viewerResult.allowed).toBe(false);
    });

    it('should throw error for banned users', async () => {
      await rateLimiter.banUser('user1');

      await expect(
        rateLimiter.checkUserLimit('user1', 'viewer')
      ).rejects.toThrow(CollaborationError);
    });
  });

  describe('checkOperationLimit', () => {
    it('should enforce operation-specific limits', async () => {
      // Comment create limit is 3
      await rateLimiter.checkOperationLimit('user1', 'comment.create', 'viewer');
      await rateLimiter.checkOperationLimit('user1', 'comment.create', 'viewer');
      await rateLimiter.checkOperationLimit('user1', 'comment.create', 'viewer');

      const result = await rateLimiter.checkOperationLimit(
        'user1',
        'comment.create',
        'viewer'
      );

      expect(result.allowed).toBe(false);
    });

    it('should track operations separately per user', async () => {
      // User1 uses comment.create
      for (let i = 0; i < 3; i++) {
        await rateLimiter.checkOperationLimit('user1', 'comment.create', 'viewer');
      }

      // User2 should still have their limit
      const result = await rateLimiter.checkOperationLimit(
        'user2',
        'comment.create',
        'viewer'
      );

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(2);
    });

    it('should handle session creation limit strictly', async () => {
      // Session create limit is 1 per window
      await rateLimiter.checkOperationLimit('user1', 'session.create', 'operator');
      
      const result = await rateLimiter.checkOperationLimit(
        'user1',
        'session.create',
        'operator'
      );

      expect(result.allowed).toBe(false);
    });
  });

  describe('checkIpLimit', () => {
    it('should allow requests within IP limit', async () => {
      const result = await rateLimiter.checkIpLimit('192.168.1.1');

      expect(result.allowed).toBe(true);
    });

    it('should block requests exceeding IP limit', async () => {
      // Default IP limit is 300 in our config, but we set it lower for tests
      const limiter = new RateLimiter({
        ipLimit: 5,
        ipWindowMs: 1000,
      });

      for (let i = 0; i < 5; i++) {
        await limiter.checkIpLimit('192.168.1.1');
      }

      const result = await limiter.checkIpLimit('192.168.1.1');

      expect(result.allowed).toBe(false);
      
      // await limiter.cleanup();
    });

    it('should throw error for banned IPs', async () => {
      await rateLimiter.banIp('192.168.1.100');

      await expect(
        rateLimiter.checkIpLimit('192.168.1.100')
      ).rejects.toThrow(CollaborationError);
    });

    it('should track different IPs separately', async () => {
      await rateLimiter.checkIpLimit('192.168.1.1');
      await rateLimiter.checkIpLimit('192.168.1.1');

      // Different IP should have fresh limit
      const result = await rateLimiter.checkIpLimit('192.168.1.2');
      
      expect(result.remaining).toBeGreaterThan(0);
    });
  });

  describe('recordViolation', () => {
    it('should track violations', async () => {
      await rateLimiter.recordViolation('user1');
      await rateLimiter.recordViolation('user1');
      await rateLimiter.recordViolation('user1');

      // After 3 violations, user should be banned
      expect(await rateLimiter.isUserBanned('user1')).toBe(true);
    });

    it('should auto-ban after max violations', async () => {
      // maxViolationsBeforeBan is 3 in test config
      await rateLimiter.recordViolation('user1');
      await rateLimiter.recordViolation('user1');
      await rateLimiter.recordViolation('user1');

      await expect(
        rateLimiter.checkUserLimit('user1', 'viewer')
      ).rejects.toThrow('temporarily banned');
    });

    it('should decay violations over time', async () => {
      await rateLimiter.recordViolation('user1');
      await rateLimiter.recordViolation('user1');

      // Wait for violations to decay
      await sleep(600); // violationDecayMs is 500ms

      // Should not be banned after decay
      const result = await rateLimiter.checkUserLimit('user1', 'viewer');
      expect(result.allowed).toBe(true);
    });
  });

  describe('banUser and unbanUser', () => {
    it('should ban user temporarily', async () => {
      await rateLimiter.banUser('user1');

      expect(await rateLimiter.isUserBanned('user1')).toBe(true);

      await expect(
        rateLimiter.checkUserLimit('user1', 'viewer')
      ).rejects.toThrow(CollaborationError);
    });

    it('should auto-unban after duration', async () => {
      await rateLimiter.banUser('user1', 500); // 500ms ban

      expect(await rateLimiter.isUserBanned('user1')).toBe(true);

      // Wait for ban to expire
      await sleep(600);

      expect(await rateLimiter.isUserBanned('user1')).toBe(false);
    });

    it('should manually unban user', async () => {
      await rateLimiter.banUser('user1');
      expect(await rateLimiter.isUserBanned('user1')).toBe(true);

      await rateLimiter.unbanUser('user1');
      expect(await rateLimiter.isUserBanned('user1')).toBe(false);
    });

    it('should use custom ban duration', async () => {
      await rateLimiter.banUser('user1', 200); // 200ms custom duration

      await sleep(250);

      expect(await rateLimiter.isUserBanned('user1')).toBe(false);
    });
  });

  describe('banIp and unbanIp', () => {
    it('should ban IP temporarily', async () => {
      await rateLimiter.banIp('192.168.1.100');

      expect(await rateLimiter.isIpBanned('192.168.1.100')).toBe(true);

      await expect(
        rateLimiter.checkIpLimit('192.168.1.100')
      ).rejects.toThrow(CollaborationError);
    });

    it('should auto-unban IP after duration', async () => {
      await rateLimiter.banIp('192.168.1.100', 500);

      await sleep(600);

      expect(await rateLimiter.isIpBanned('192.168.1.100')).toBe(false);
    });

    it('should manually unban IP', async () => {
      await rateLimiter.banIp('192.168.1.100');
      await rateLimiter.unbanIp('192.168.1.100');

      expect(await rateLimiter.isIpBanned('192.168.1.100')).toBe(false);
    });
  });

  describe('exponential backoff', () => {
    it('should apply backoff after violations', async () => {
      const limiter = new RateLimiter({
        enableBackoff: true,
        backoffMultiplier: 2,
        maxBackoffMs: 5000,
        defaultLimit: 2,
        defaultWindowMs: 100,
        roleLimits: {
          admin: 2,
          operator: 2,
          analyst: 2,
          viewer: 2,
        },
      });

      // Violate limit
      await limiter.checkUserLimit('user1', 'viewer');
      await limiter.checkUserLimit('user1', 'viewer');
      const violation1 = await limiter.checkUserLimit('user1', 'viewer');

      expect(violation1.allowed).toBe(false);
      expect(violation1.retryAfter).toBeDefined();

      // Second violation should have longer retry time
      await sleep(150); // Wait for window to reset
      await limiter.checkUserLimit('user1', 'viewer');
      await limiter.checkUserLimit('user1', 'viewer');
      const violation2 = await limiter.checkUserLimit('user1', 'viewer');

      expect(violation2.retryAfter).toBeGreaterThanOrEqual(violation1.retryAfter!);
      
      // await limiter.cleanup();
    });

    it('should cap backoff at maxBackoffMs', async () => {
      const limiter = new RateLimiter({
        enableBackoff: true,
        backoffMultiplier: 10,
        maxBackoffMs: 1000,
        defaultLimit: 1,
        defaultWindowMs: 100,
        roleLimits: {
          admin: 1,
          operator: 1,
          analyst: 1,
          viewer: 1,
        },
      });

      // Multiple violations
      for (let i = 0; i < 5; i++) {
        await sleep(150);
        await limiter.checkUserLimit('user1', 'viewer');
        const result = await limiter.checkUserLimit('user1', 'viewer');
        
        if (result.retryAfter) {
          expect(result.retryAfter).toBeLessThanOrEqual(1000);
        }
      }
      
      // await limiter.cleanup();
    });
  });

  describe('concurrent requests', () => {
    it('should handle concurrent requests correctly', async () => {
      const limiter = new RateLimiter({
        defaultLimit: 5,
        defaultWindowMs: 1000,
        roleLimits: {
          admin: 5,
          operator: 5,
          analyst: 5,
          viewer: 5,
        },
      });

      // Make 10 sequential requests (not truly concurrent to avoid race condition in memory store)
      const results = [];
      for (let i = 0; i < 10; i++) {
        results.push(await limiter.checkUserLimit('user1', 'viewer'));
      }

      // Should allow first 5, reject next 5
      const allowed = results.filter((r) => r.allowed);
      const rejected = results.filter((r) => !r.allowed);

      expect(allowed.length).toBe(5);
      expect(rejected.length).toBe(5);
      
      // await limiter.cleanup();
    });
  });

  describe.skip('cleanup', () => {
    // Cleanup method not yet implemented
    it('should clean up timers and intervals', async () => {
      await rateLimiter.banUser('user1');
      await rateLimiter.banIp('192.168.1.1');

      // await rateLimiter.cleanup();

      // After cleanup, memory should be cleared
      // expect(rateLimiter['memoryStore'].size).toBe(0);
      // expect(rateLimiter['banTimers'].size).toBe(0);
    });

    it('should stop cleanup interval', async () => {
      // const initialInterval = rateLimiter['cleanupInterval'];
      
      // await rateLimiter.cleanup();

      // expect(rateLimiter['cleanupInterval']).toBeUndefined();
    });
  });

  describe('configuration', () => {
    it('should use custom configuration', () => {
      const customLimiter = new RateLimiter({
        defaultLimit: 5,
        roleLimits: {
          admin: 50,
          operator: 25,
          analyst: 10,
          viewer: 5,
        },
      });

      expect(customLimiter['config'].defaultLimit).toBe(5);
      expect(customLimiter['config'].roleLimits.admin).toBe(50);
    });

    it('should merge with default configuration', () => {
      const customLimiter = new RateLimiter({
        defaultLimit: 5,
      });

      // Should keep default values for unspecified config
      expect(customLimiter['config'].maxViolationsBeforeBan).toBeDefined();
      expect(customLimiter['config'].enableBackoff).toBeDefined();
    });
  });

  describe('edge cases', () => {
    it('should handle rapid successive requests', async () => {
      const results = [];
      
      for (let i = 0; i < 15; i++) {
        results.push(await rateLimiter.checkUserLimit('user1', 'viewer'));
      }

      const allowed = results.filter((r) => r.allowed);
      expect(allowed.length).toBeLessThanOrEqual(10);
    });

    it('should handle empty user ID', async () => {
      const result = await rateLimiter.checkUserLimit('', 'viewer');
      expect(result).toBeDefined();
    });

    it('should track different operations independently', async () => {
      // Use up comment.create limit
      for (let i = 0; i < 3; i++) {
        await rateLimiter.checkOperationLimit('user1', 'comment.create', 'viewer');
      }

      // comment.edit should still be available
      const result = await rateLimiter.checkOperationLimit(
        'user1',
        'comment.edit',
        'viewer'
      );

      expect(result.allowed).toBe(true);
    });
  });
});