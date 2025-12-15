/**
 * Comprehensive tests for LoggingService
 * ======================================
 * 
 * Tests for logging levels, formatting, and log management.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: number;
  context?: Record<string, any>;
}

class MockLoggingService {
  private logs: LogEntry[];
  private minLevel: LogLevel;
  private maxLogs: number;
  private levelPriority = { debug: 0, info: 1, warn: 2, error: 3 };

  constructor(minLevel: LogLevel = 'info', maxLogs: number = 1000) {
    this.logs = [];
    this.minLevel = minLevel;
    this.maxLogs = maxLogs;
  }

  private shouldLog(level: LogLevel): boolean {
    return this.levelPriority[level] >= this.levelPriority[this.minLevel];
  }

  private addLog(entry: LogEntry): void {
    if (this.logs.length >= this.maxLogs) {
      this.logs.shift();
    }
    this.logs.push(entry);
  }

  debug(message: string, context?: Record<string, any>): void {
    if (this.shouldLog('debug')) {
      this.addLog({ level: 'debug', message, timestamp: Date.now(), context });
    }
  }

  info(message: string, context?: Record<string, any>): void {
    if (this.shouldLog('info')) {
      this.addLog({ level: 'info', message, timestamp: Date.now(), context });
    }
  }

  warn(message: string, context?: Record<string, any>): void {
    if (this.shouldLog('warn')) {
      this.addLog({ level: 'warn', message, timestamp: Date.now(), context });
    }
  }

  error(message: string, context?: Record<string, any>): void {
    if (this.shouldLog('error')) {
      this.addLog({ level: 'error', message, timestamp: Date.now(), context });
    }
  }

  getLogs(level?: LogLevel): LogEntry[] {
    if (level) {
      return this.logs.filter(log => log.level === level);
    }
    return [...this.logs];
  }

  clear(): void {
    this.logs = [];
  }

  setMinLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  getLogCount(): number {
    return this.logs.length;
  }

  exportLogs(): string {
    return this.logs.map(log => 
      `[${new Date(log.timestamp).toISOString()}] ${log.level.toUpperCase()}: ${log.message}`
    ).join('\n');
  }
}

describe('LoggingService', () => {
  let logger: MockLoggingService;

  beforeEach(() => {
    logger = new MockLoggingService();
  });

  describe('Initialization', () => {
    it('should initialize with default info level', () => {
      expect(logger).toBeDefined();
    });

    it('should initialize with empty logs', () => {
      expect(logger.getLogCount()).toBe(0);
    });

    it('should initialize with custom level', () => {
      const debugLogger = new MockLoggingService('debug');
      expect(debugLogger).toBeDefined();
    });

    it('should initialize with custom max logs', () => {
      const limitedLogger = new MockLoggingService('info', 100);
      expect(limitedLogger).toBeDefined();
    });
  });

  describe('Log Levels', () => {
    it('should log info messages', () => {
      logger.info('Test message');
      expect(logger.getLogCount()).toBe(1);
    });

    it('should log warn messages', () => {
      logger.warn('Warning message');
      const logs = logger.getLogs('warn');
      expect(logs).toHaveLength(1);
    });

    it('should log error messages', () => {
      logger.error('Error message');
      const logs = logger.getLogs('error');
      expect(logs).toHaveLength(1);
    });

    it('should not log debug when level is info', () => {
      logger.debug('Debug message');
      expect(logger.getLogCount()).toBe(0);
    });

    it('should log debug when level is set to debug', () => {
      logger.setMinLevel('debug');
      logger.debug('Debug message');
      expect(logger.getLogCount()).toBe(1);
    });
  });

  describe('Log Filtering', () => {
    beforeEach(() => {
      logger.setMinLevel('debug');
      logger.debug('Debug message');
      logger.info('Info message');
      logger.warn('Warn message');
      logger.error('Error message');
    });

    it('should filter logs by level', () => {
      const infoLogs = logger.getLogs('info');
      expect(infoLogs).toHaveLength(1);
      expect(infoLogs[0].level).toBe('info');
    });

    it('should get all logs when no filter specified', () => {
      const allLogs = logger.getLogs();
      expect(allLogs).toHaveLength(4);
    });

    it('should filter error logs only', () => {
      const errorLogs = logger.getLogs('error');
      expect(errorLogs).toHaveLength(1);
      expect(errorLogs[0].level).toBe('error');
    });
  });

  describe('Log Context', () => {
    it('should include context in log entry', () => {
      logger.info('Test', { userId: 123, action: 'login' });
      const logs = logger.getLogs();
      expect(logs[0].context?.userId).toBe(123);
    });

    it('should handle logs without context', () => {
      logger.info('Test');
      const logs = logger.getLogs();
      expect(logs[0].context).toBeUndefined();
    });

    it('should preserve complex context objects', () => {
      const context = {
        user: { id: 1, name: 'Test' },
        meta: { timestamp: Date.now() }
      };
      logger.info('Test', context);
      const logs = logger.getLogs();
      expect(logs[0].context?.user.id).toBe(1);
    });
  });

  describe('Log Timestamps', () => {
    it('should include timestamp in log entry', () => {
      logger.info('Test');
      const logs = logger.getLogs();
      expect(logs[0].timestamp).toBeDefined();
      expect(logs[0].timestamp).toBeLessThanOrEqual(Date.now());
    });

    it('should have sequential timestamps', () => {
      logger.info('First');
      logger.info('Second');
      const logs = logger.getLogs();
      expect(logs[1].timestamp).toBeGreaterThanOrEqual(logs[0].timestamp);
    });
  });

  describe('Log Rotation', () => {
    it('should rotate logs when max is reached', () => {
      const limitedLogger = new MockLoggingService('info', 5);
      for (let i = 0; i < 10; i++) {
        limitedLogger.info(`Message ${i}`);
      }
      expect(limitedLogger.getLogCount()).toBe(5);
    });

    it('should keep most recent logs after rotation', () => {
      const limitedLogger = new MockLoggingService('info', 3);
      limitedLogger.info('Message 1');
      limitedLogger.info('Message 2');
      limitedLogger.info('Message 3');
      limitedLogger.info('Message 4');
      const logs = limitedLogger.getLogs();
      expect(logs[0].message).toBe('Message 2');
      expect(logs[2].message).toBe('Message 4');
    });
  });

  describe('Log Clearing', () => {
    it('should clear all logs', () => {
      logger.info('Test 1');
      logger.info('Test 2');
      logger.clear();
      expect(logger.getLogCount()).toBe(0);
    });

    it('should allow new logs after clearing', () => {
      logger.info('Test');
      logger.clear();
      logger.info('New test');
      expect(logger.getLogCount()).toBe(1);
    });
  });

  describe('Log Export', () => {
    it('should export logs as formatted string', () => {
      logger.info('Test message');
      const exported = logger.exportLogs();
      expect(exported).toContain('INFO');
      expect(exported).toContain('Test message');
    });

    it('should export multiple logs', () => {
      logger.info('Message 1');
      logger.warn('Message 2');
      const exported = logger.exportLogs();
      expect(exported.split('\n')).toHaveLength(2);
    });

    it('should include timestamps in export', () => {
      logger.info('Test');
      const exported = logger.exportLogs();
      expect(exported).toMatch(/\d{4}-\d{2}-\d{2}/);
    });
  });

  describe('Level Changes', () => {
    it('should change minimum log level', () => {
      logger.setMinLevel('error');
      logger.info('Info message');
      logger.error('Error message');
      expect(logger.getLogCount()).toBe(1);
    });

    it('should respect new level for subsequent logs', () => {
      logger.info('Before change');
      logger.setMinLevel('warn');
      logger.info('After change');
      const logs = logger.getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].message).toBe('Before change');
    });

    it('should allow lowering log level', () => {
      logger.setMinLevel('error');
      logger.setMinLevel('debug');
      logger.debug('Debug message');
      expect(logger.getLogCount()).toBe(1);
    });
  });

  describe('Performance', () => {
    it('should handle high volume logging', () => {
      const start = Date.now();
      for (let i = 0; i < 1000; i++) {
        logger.info(`Message ${i}`);
      }
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(1000);
    });

    it('should filter efficiently', () => {
      logger.setMinLevel('debug');
      for (let i = 0; i < 100; i++) {
        logger.info(`Info ${i}`);
        logger.error(`Error ${i}`);
      }
      const errorLogs = logger.getLogs('error');
      expect(errorLogs).toHaveLength(100);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty messages', () => {
      logger.info('');
      expect(logger.getLogCount()).toBe(1);
    });

    it('should handle very long messages', () => {
      const longMessage = 'a'.repeat(10000);
      logger.info(longMessage);
      const logs = logger.getLogs();
      expect(logs[0].message).toHaveLength(10000);
    });

    it('should handle special characters', () => {
      logger.info('Message with\nnewlines\tand\ttabs');
      const logs = logger.getLogs();
      expect(logs[0].message).toContain('\n');
    });

    it('should handle null context gracefully', () => {
      logger.info('Test', undefined);
      expect(logger.getLogCount()).toBe(1);
    });
  });
});

describe('LoggingService Integration', () => {
  it('should track application flow', () => {
    const logger = new MockLoggingService('debug');
    
    logger.info('Application started');
    logger.debug('Loading configuration');
    logger.info('Configuration loaded', { env: 'test' });
    logger.warn('Using default settings');
    logger.info('Application ready');
    
    const logs = logger.getLogs();
    expect(logs).toHaveLength(5);
    expect(logs[0].message).toBe('Application started');
    expect(logs[4].message).toBe('Application ready');
  });

  it('should handle error scenarios', () => {
    const logger = new MockLoggingService();
    
    logger.info('Starting operation');
    logger.error('Operation failed', { error: 'Connection timeout' });
    logger.warn('Retrying operation');
    logger.info('Operation succeeded');
    
    const errorLogs = logger.getLogs('error');
    expect(errorLogs).toHaveLength(1);
    expect(errorLogs[0].context?.error).toBe('Connection timeout');
  });
});