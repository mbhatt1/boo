/**
 * Unit tests for errorHandler utility
 * Testing error processing, logging, and recovery
 */

import { ErrorHandler } from '../../src/utils/errorHandler';
import { jest } from '@jest/globals';

describe('ErrorHandler', () => {
  let consoleErrorSpy: any;
  let originalConsoleError: typeof console.error;

  beforeEach(() => {
    originalConsoleError = console.error;
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    if (consoleErrorSpy && consoleErrorSpy.mockRestore) {
      consoleErrorSpy.mockRestore();
    } else {
      console.error = originalConsoleError;
    }
  });

  describe('Error Processing', () => {
    test('should process standard errors', () => {
      const error = new Error('Test error');
      const result = ErrorHandler.process(error);
      
      expect(result).toHaveProperty('message', 'Test error');
      expect(result).toHaveProperty('type', 'Error');
    });

    test('should handle errors with stack traces', () => {
      const error = new Error('Stack test');
      const result = ErrorHandler.process(error);
      
      expect(result).toHaveProperty('stack');
      expect(result.stack).toBeTruthy();
    });

    test('should process non-Error objects', () => {
      const notAnError = { custom: 'error object' };
      const result = ErrorHandler.process(notAnError);
      
      expect(result).toHaveProperty('message');
    });

    test('should handle null and undefined', () => {
      const nullResult = ErrorHandler.process(null);
      const undefinedResult = ErrorHandler.process(undefined);
      
      expect(nullResult).toHaveProperty('message');
      expect(undefinedResult).toHaveProperty('message');
    });
  });

  describe('Error Classification', () => {
    test('should identify network errors', () => {
      const networkError = new Error('Network request failed');
      networkError.name = 'NetworkError';
      
      const type = ErrorHandler.classify(networkError);
      
      expect(type).toBe('network');
    });

    test('should identify validation errors', () => {
      const validationError = new Error('Invalid input');
      validationError.name = 'ValidationError';
      
      const type = ErrorHandler.classify(validationError);
      
      expect(type).toBe('validation');
    });

    test('should identify timeout errors', () => {
      const timeoutError = new Error('Request timeout');
      
      const type = ErrorHandler.classify(timeoutError);
      
      expect(type).toBe('timeout');
    });

    test('should default to unknown for unrecognized errors', () => {
      const unknownError = new Error('Some error');
      
      const type = ErrorHandler.classify(unknownError);
      
      expect(type).toBe('unknown');
    });
  });

  describe('Error Logging', () => {
    test('should log error with context', () => {
      const error = new Error('Test error');
      const context = { operation: 'test-op', userId: '123' };
      
      ErrorHandler.log(error, context);
      
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    test('should include timestamp in logs', () => {
      const error = new Error('Time test');
      
      ErrorHandler.log(error);
      
      const logCall = consoleErrorSpy.mock.calls[0];
      expect(logCall).toBeDefined();
    });

    test('should handle logging without context', () => {
      const error = new Error('No context');
      
      expect(() => ErrorHandler.log(error)).not.toThrow();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe('Error Recovery', () => {
    test('should provide recovery suggestions for network errors', () => {
      const error = new Error('Network error');
      error.name = 'NetworkError';
      
      const suggestion = ErrorHandler.getRecoverySuggestion(error);
      
      expect(suggestion).toContain('network');
    });

    test('should provide recovery suggestions for validation errors', () => {
      const error = new Error('Validation failed');
      error.name = 'ValidationError';
      
      const suggestion = ErrorHandler.getRecoverySuggestion(error);
      
      expect(suggestion).toContain('input');
    });

    test('should provide generic suggestion for unknown errors', () => {
      const error = new Error('Unknown error');
      
      const suggestion = ErrorHandler.getRecoverySuggestion(error);
      
      expect(suggestion).toBeTruthy();
    });
  });

  describe('Error Formatting', () => {
    test('should format error for display', () => {
      const error = new Error('Display test');
      
      const formatted = ErrorHandler.format(error);
      
      expect(formatted).toContain('Display test');
      expect(typeof formatted).toBe('string');
    });

    test('should truncate long error messages', () => {
      const longMessage = 'x'.repeat(1000);
      const error = new Error(longMessage);
      
      const formatted = ErrorHandler.format(error, { maxLength: 100 });
      
      expect(formatted.length).toBeLessThanOrEqual(100);
    });

    test('should include error type in formatted output', () => {
      const error = new Error('Type test');
      error.name = 'CustomError';
      
      const formatted = ErrorHandler.format(error, { includeType: true });
      
      expect(formatted).toContain('CustomError');
    });
  });

  describe('Error Sanitization', () => {
    test('should remove sensitive information', () => {
      const error = new Error('Error with password: secret123');
      
      const sanitized = ErrorHandler.sanitize(error);
      
      expect(sanitized.message).not.toContain('secret123');
    });

    test('should remove API keys', () => {
      const error = new Error('API key: abc-123-xyz');
      
      const sanitized = ErrorHandler.sanitize(error);
      
      expect(sanitized.message).not.toContain('abc-123-xyz');
    });

    test('should preserve error structure', () => {
      const error = new Error('Test');
      error.name = 'TestError';
      
      const sanitized = ErrorHandler.sanitize(error);
      
      expect(sanitized.name).toBe('TestError');
      expect(sanitized).toBeInstanceOf(Error);
    });
  });
});