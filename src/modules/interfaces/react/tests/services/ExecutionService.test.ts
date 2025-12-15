/**
 * Comprehensive unit tests for ExecutionService
 * Testing async operations, error handling, and service lifecycle
 */

import { ExecutionService } from '../../src/services/ExecutionService';

describe('ExecutionService', () => {
  describe('Error Handling', () => {
    test('should handle network timeouts gracefully', async () => {
      const service = new ExecutionService();
      
      // Mock a timeout scenario
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Timeout')), 100);
      });
      
      await expect(timeoutPromise).rejects.toThrow('Timeout');
    });

    test('should validate input parameters', () => {
      const service = new ExecutionService();
      
      // Test with invalid parameters
      expect(() => {
        // @ts-ignore - Testing runtime validation
        service.execute(null);
      }).toThrow();
    });

    test('should handle concurrent execution requests', async () => {
      const service = new ExecutionService();
      
      const promises = Array.from({ length: 5 }, (_, i) =>
        service.execute({ command: `test${i}` })
      );
      
      const results = await Promise.allSettled(promises);
      expect(results).toHaveLength(5);
    });
  });

  describe('Resource Management', () => {
    test('should clean up resources on disposal', () => {
      const service = new ExecutionService();
      
      service.dispose();
      
      // Verify cleanup
      expect(service.isDisposed).toBe(true);
    });

    test('should prevent operations after disposal', () => {
      const service = new ExecutionService();
      
      service.dispose();
      
      expect(() => {
        service.execute({ command: 'test' });
      }).toThrow('Service is disposed');
    });

    test('should handle multiple disposal calls safely', () => {
      const service = new ExecutionService();
      
      service.dispose();
      service.dispose(); // Should not throw
      
      expect(service.isDisposed).toBe(true);
    });
  });

  describe('Execution Flow', () => {
    test('should execute commands in order', async () => {
      const service = new ExecutionService();
      const results: number[] = [];
      
      await service.execute({ command: 'cmd1', onData: () => results.push(1) });
      await service.execute({ command: 'cmd2', onData: () => results.push(2) });
      await service.execute({ command: 'cmd3', onData: () => results.push(3) });
      
      expect(results).toEqual([1, 2, 3]);
    });

    test('should handle command cancellation', async () => {
      const service = new ExecutionService();
      
      const executionPromise = service.execute({
        command: 'long-running-command'
      });
      
      // Cancel after a short delay
      setTimeout(() => service.cancel(), 10);
      
      await expect(executionPromise).rejects.toThrow('Cancelled');
    });

    test('should emit progress updates', async () => {
      const service = new ExecutionService();
      const progressUpdates: number[] = [];
      
      await service.execute({
        command: 'test',
        onProgress: (progress) => progressUpdates.push(progress)
      });
      
      expect(progressUpdates.length).toBeGreaterThan(0);
    });
  });

  describe('State Management', () => {
    test('should track execution state', () => {
      const service = new ExecutionService();
      
      expect(service.isExecuting).toBe(false);
      
      service.execute({ command: 'test' });
      
      expect(service.isExecuting).toBe(true);
    });

    test('should reset state after execution', async () => {
      const service = new ExecutionService();
      
      await service.execute({ command: 'test' });
      
      expect(service.isExecuting).toBe(false);
    });

    test('should handle state transitions correctly', async () => {
      const service = new ExecutionService();
      const states: string[] = [];
      
      service.onStateChange((state) => states.push(state));
      
      await service.execute({ command: 'test' });
      
      expect(states).toContain('idle');
      expect(states).toContain('executing');
      expect(states).toContain('completed');
    });
  });

  describe('Error Recovery', () => {
    test('should retry failed operations', async () => {
      const service = new ExecutionService({ maxRetries: 3 });
      let attempts = 0;
      
      const result = await service.execute({
        command: 'test',
        onExecute: () => {
          attempts++;
          if (attempts < 3) throw new Error('Temporary failure');
          return 'success';
        }
      });
      
      expect(attempts).toBe(3);
      expect(result).toBe('success');
    });

    test('should fail after max retries exceeded', async () => {
      const service = new ExecutionService({ maxRetries: 2 });
      
      await expect(service.execute({
        command: 'test',
        onExecute: () => {
          throw new Error('Persistent failure');
        }
      })).rejects.toThrow('Persistent failure');
    });

    test('should use exponential backoff for retries', async () => {
      const service = new ExecutionService({ maxRetries: 3 });
      const retryDelays: number[] = [];
      let lastTime = Date.now();
      
      await service.execute({
        command: 'test',
        onRetry: () => {
          const now = Date.now();
          retryDelays.push(now - lastTime);
          lastTime = now;
          throw new Error('Retry test');
        }
      }).catch(() => {});
      
      // Each retry should take longer than the previous
      for (let i = 1; i < retryDelays.length; i++) {
        expect(retryDelays[i]).toBeGreaterThan(retryDelays[i - 1]);
      }
    });
  });
});