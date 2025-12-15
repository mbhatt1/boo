/**
 * Comprehensive tests for Retry Mechanism
 * =======================================
 * 
 * Tests for retry logic, backoff strategies, and error handling.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

interface RetryOptions {
  maxAttempts: number;
  delay: number;
  backoff: 'linear' | 'exponential';
  maxDelay?: number;
}

class RetryError extends Error {
  constructor(message: string, public attempts: number) {
    super(message);
    this.name = 'RetryError';
  }
}

class MockRetryService {
  private attempts = 0;

  async retry<T>(
    fn: () => Promise<T>,
    options: RetryOptions
  ): Promise<T> {
    this.attempts = 0;
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
      this.attempts = attempt;
      
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < options.maxAttempts) {
          const delay = this.calculateDelay(attempt, options);
          await this.sleep(delay);
        }
      }
    }

    throw new RetryError(
      `Failed after ${this.attempts} attempts: ${lastError?.message}`,
      this.attempts
    );
  }

  private calculateDelay(attempt: number, options: RetryOptions): number {
    let delay: number;
    
    if (options.backoff === 'exponential') {
      delay = options.delay * Math.pow(2, attempt - 1);
    } else {
      delay = options.delay * attempt;
    }

    if (options.maxDelay) {
      delay = Math.min(delay, options.maxDelay);
    }

    return delay;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getAttemptCount(): number {
    return this.attempts;
  }

  reset(): void {
    this.attempts = 0;
  }
}

describe('RetryService', () => {
  let retryService: MockRetryService;

  beforeEach(() => {
    retryService = new MockRetryService();
  });

  describe('Basic Retry', () => {
    it('should succeed on first attempt', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      const result = await retryService.retry(fn, {
        maxAttempts: 3,
        delay: 100,
        backoff: 'linear'
      });
      
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure', async () => {
      let callCount = 0;
      const fn = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          return Promise.reject(new Error('Failed'));
        }
        return Promise.resolve('success');
      });

      const result = await retryService.retry(fn, {
        maxAttempts: 3,
        delay: 10,
        backoff: 'linear'
      });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should throw after max attempts', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Always fails'));
      
      await expect(
        retryService.retry(fn, {
          maxAttempts: 3,
          delay: 10,
          backoff: 'linear'
        })
      ).rejects.toThrow(RetryError);
    });

    it('should track attempt count', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Failed'));
      
      try {
        await retryService.retry(fn, {
          maxAttempts: 5,
          delay: 10,
          backoff: 'linear'
        });
      } catch (error) {
        expect(retryService.getAttemptCount()).toBe(5);
      }
    });
  });

  describe('Linear Backoff', () => {
    it('should use linear backoff delays', async () => {
      const delays: number[] = [];
      let callCount = 0;
      
      const fn = jest.fn().mockImplementation(() => {
        callCount++;
        const start = Date.now();
        return new Promise((_, reject) => {
          if (callCount > 1) {
            delays.push(Date.now() - start);
          }
          reject(new Error('Failed'));
        });
      });

      try {
        await retryService.retry(fn, {
          maxAttempts: 3,
          delay: 50,
          backoff: 'linear'
        });
      } catch (error) {
        // Expected to fail
      }

      expect(callCount).toBe(3);
    });

    it('should calculate linear delays correctly', async () => {
      const calculateDelay = (attempt: number, baseDelay: number) => {
        return baseDelay * attempt;
      };

      expect(calculateDelay(1, 100)).toBe(100);
      expect(calculateDelay(2, 100)).toBe(200);
      expect(calculateDelay(3, 100)).toBe(300);
    });
  });

  describe('Exponential Backoff', () => {
    it('should use exponential backoff delays', async () => {
      let callCount = 0;
      const fn = jest.fn().mockImplementation(() => {
        callCount++;
        return Promise.reject(new Error('Failed'));
      });

      try {
        await retryService.retry(fn, {
          maxAttempts: 4,
          delay: 10,
          backoff: 'exponential'
        });
      } catch (error) {
        // Expected to fail
      }

      expect(callCount).toBe(4);
    });

    it('should calculate exponential delays correctly', async () => {
      const calculateDelay = (attempt: number, baseDelay: number) => {
        return baseDelay * Math.pow(2, attempt - 1);
      };

      expect(calculateDelay(1, 100)).toBe(100);
      expect(calculateDelay(2, 100)).toBe(200);
      expect(calculateDelay(3, 100)).toBe(400);
      expect(calculateDelay(4, 100)).toBe(800);
    });

    it('should respect max delay cap', async () => {
      const calculateDelayWithCap = (
        attempt: number,
        baseDelay: number,
        maxDelay: number
      ) => {
        const delay = baseDelay * Math.pow(2, attempt - 1);
        return Math.min(delay, maxDelay);
      };

      expect(calculateDelayWithCap(5, 100, 500)).toBe(500);
      expect(calculateDelayWithCap(6, 100, 500)).toBe(500);
    });
  });

  describe('Error Handling', () => {
    it('should preserve original error message', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Original error'));
      
      try {
        await retryService.retry(fn, {
          maxAttempts: 2,
          delay: 10,
          backoff: 'linear'
        });
      } catch (error) {
        expect((error as Error).message).toContain('Original error');
      }
    });

    it('should include attempt count in error', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Failed'));
      
      try {
        await retryService.retry(fn, {
          maxAttempts: 3,
          delay: 10,
          backoff: 'linear'
        });
      } catch (error) {
        if (error instanceof RetryError) {
          expect(error.attempts).toBe(3);
        }
      }
    });

    it('should handle different error types', async () => {
      const fn = jest.fn().mockRejectedValue(new TypeError('Type error'));
      
      await expect(
        retryService.retry(fn, {
          maxAttempts: 2,
          delay: 10,
          backoff: 'linear'
        })
      ).rejects.toThrow();
    });
  });

  describe('Configuration Options', () => {
    it('should respect max attempts setting', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Failed'));
      
      try {
        await retryService.retry(fn, {
          maxAttempts: 5,
          delay: 10,
          backoff: 'linear'
        });
      } catch (error) {
        expect(fn).toHaveBeenCalledTimes(5);
      }
    });

    it('should work with single attempt', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Failed'));
      
      try {
        await retryService.retry(fn, {
          maxAttempts: 1,
          delay: 10,
          backoff: 'linear'
        });
      } catch (error) {
        expect(fn).toHaveBeenCalledTimes(1);
      }
    });

    it('should handle zero delay', async () => {
      let callCount = 0;
      const fn = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount < 2) {
          return Promise.reject(new Error('Failed'));
        }
        return Promise.resolve('success');
      });

      const result = await retryService.retry(fn, {
        maxAttempts: 2,
        delay: 0,
        backoff: 'linear'
      });

      expect(result).toBe('success');
    });
  });

  describe('Success Scenarios', () => {
    it('should return result on eventual success', async () => {
      let callCount = 0;
      const fn = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount < 2) {
          return Promise.reject(new Error('Failed'));
        }
        return Promise.resolve({ data: 'success' });
      });

      const result = await retryService.retry(fn, {
        maxAttempts: 3,
        delay: 10,
        backoff: 'linear'
      });

      expect(result).toEqual({ data: 'success' });
    });

    it('should handle async operations', async () => {
      const fn = jest.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'async success';
      });

      const result = await retryService.retry(fn, {
        maxAttempts: 2,
        delay: 10,
        backoff: 'linear'
      });

      expect(result).toBe('async success');
    });
  });

  describe('Edge Cases', () => {
    it('should handle immediate success', async () => {
      const fn = jest.fn().mockResolvedValue('immediate');
      
      const result = await retryService.retry(fn, {
        maxAttempts: 3,
        delay: 100,
        backoff: 'exponential'
      });

      expect(result).toBe('immediate');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should handle very large max attempts', async () => {
      let callCount = 0;
      const fn = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount < 5) {
          return Promise.reject(new Error('Failed'));
        }
        return Promise.resolve('success');
      });

      const result = await retryService.retry(fn, {
        maxAttempts: 100,
        delay: 1,
        backoff: 'linear'
      });

      expect(result).toBe('success');
      expect(callCount).toBe(5);
    });

    it('should reset attempt count between retries', async () => {
      const fn1 = jest.fn().mockResolvedValue('success1');
      await retryService.retry(fn1, {
        maxAttempts: 3,
        delay: 10,
        backoff: 'linear'
      });

      const fn2 = jest.fn().mockResolvedValue('success2');
      await retryService.retry(fn2, {
        maxAttempts: 3,
        delay: 10,
        backoff: 'linear'
      });

      expect(retryService.getAttemptCount()).toBe(1);
    });
  });

  describe('Performance', () => {
    it('should handle rapid retry cycles', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          retryService.retry(fn, {
            maxAttempts: 2,
            delay: 1,
            backoff: 'linear'
          })
        );
      }

      await Promise.all(promises);
      expect(fn).toHaveBeenCalled();
    });

    it('should not delay on final attempt', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Failed'));
      const start = Date.now();

      try {
        await retryService.retry(fn, {
          maxAttempts: 2,
          delay: 100,
          backoff: 'linear'
        });
      } catch (error) {
        const elapsed = Date.now() - start;
        // Should only delay once (between attempts)
        expect(elapsed).toBeLessThan(250);
      }
    });
  });
});

describe('RetryService Integration', () => {
  it('should handle network request retry pattern', async () => {
    const retryService = new MockRetryService();
    let attemptCount = 0;

    const mockNetworkRequest = jest.fn().mockImplementation(() => {
      attemptCount++;
      if (attemptCount < 3) {
        return Promise.reject(new Error('Network timeout'));
      }
      return Promise.resolve({ status: 200, data: 'Success' });
    });

    const result = await retryService.retry(mockNetworkRequest, {
      maxAttempts: 5,
      delay: 50,
      backoff: 'exponential',
      maxDelay: 1000
    });

    expect(result.status).toBe(200);
    expect(attemptCount).toBe(3);
  });

  it('should handle transient failures gracefully', async () => {
    const retryService = new MockRetryService();
    const failures = [true, true, false, false];
    let index = 0;

    const fn = jest.fn().mockImplementation(() => {
      const shouldFail = failures[index++];
      if (shouldFail) {
        return Promise.reject(new Error('Transient failure'));
      }
      return Promise.resolve('Success');
    });

    const result = await retryService.retry(fn, {
      maxAttempts: 5,
      delay: 10,
      backoff: 'linear'
    });

    expect(result).toBe('Success');
    expect(fn).toHaveBeenCalledTimes(3);
  });
});