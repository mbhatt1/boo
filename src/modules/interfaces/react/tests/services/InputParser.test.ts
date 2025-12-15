/**
 * Comprehensive unit tests for InputParser service
 * Testing natural language parsing, command detection, and target extraction
 */

import { InputParser, ParsedCommand } from '../../src/services/InputParser';

describe('InputParser', () => {
  let parser: InputParser;

  beforeEach(() => {
    parser = new InputParser();
  });

  describe('Basic Input Handling', () => {
    test('should return unknown type for empty input', () => {
      const result = parser.parse('');
      expect(result.type).toBe('unknown');
      expect(result.confidence).toBe(0);
    });

    test('should return unknown type for whitespace only', () => {
      const result = parser.parse('   \t\n  ');
      expect(result.type).toBe('unknown');
      expect(result.confidence).toBe(0);
    });

    test('should handle null-like strings', () => {
      const result = parser.parse('  ');
      expect(result.type).toBe('unknown');
      expect(result.confidence).toBe(0);
    });
  });

  describe('Slash Command Parsing', () => {
    test('should parse simple slash command', () => {
      const result = parser.parse('/help');
      expect(result.type).toBe('slash');
      expect(result.command).toBe('help');
      expect(result.args).toEqual([]);
      expect(result.confidence).toBe(1.0);
    });

    test('should parse slash command with arguments', () => {
      const result = parser.parse('/config show advanced');
      expect(result.type).toBe('slash');
      expect(result.command).toBe('config');
      expect(result.args).toEqual(['show', 'advanced']);
      expect(result.confidence).toBe(1.0);
    });

    test('should parse slash command with single argument', () => {
      const result = parser.parse('/reset');
      expect(result.type).toBe('slash');
      expect(result.command).toBe('reset');
      expect(result.args).toEqual([]);
      expect(result.confidence).toBe(1.0);
    });

    test('should handle slash command with extra spaces', () => {
      const result = parser.parse('/command   arg1   arg2');
      expect(result.type).toBe('slash');
      expect(result.command).toBe('command');
      expect(result.args?.length).toBeGreaterThan(0);
    });
  });

  describe('Flow Command Parsing', () => {
    test('should parse module flow command', () => {
      const result = parser.parse('module general');
      expect(result.type).toBe('flow');
      expect(result.command).toBe('module');
      expect(result.module).toBe('general');
      expect(result.confidence).toBe(1.0);
    });

    test('should parse target flow command', () => {
      const result = parser.parse('target https://example.com');
      expect(result.type).toBe('flow');
      expect(result.command).toBe('target');
      expect(result.target).toBe('https://example.com');
      expect(result.confidence).toBe(1.0);
    });

    test('should parse objective flow command', () => {
      const result = parser.parse('objective find vulnerabilities');
      expect(result.type).toBe('flow');
      expect(result.command).toBe('objective');
      expect(result.objective).toBe('find vulnerabilities');
      expect(result.confidence).toBe(1.0);
    });

    test('should parse execute flow command', () => {
      const result = parser.parse('execute');
      expect(result.type).toBe('flow');
      expect(result.command).toBe('execute');
      expect(result.confidence).toBe(1.0);
    });

    test('should parse reset flow command', () => {
      const result = parser.parse('reset');
      expect(result.type).toBe('flow');
      expect(result.command).toBe('reset');
      expect(result.confidence).toBe(1.0);
    });

    test('should handle flow command case insensitivity', () => {
      const result = parser.parse('MODULE general');
      expect(result.type).toBe('flow');
      expect(result.command).toBe('module');
      expect(result.module).toBe('general');
    });
  });

  describe('Natural Language - URL Target Detection', () => {
    test('should detect HTTP URL target', () => {
      const result = parser.parse('scan http://example.com');
      expect(result.type).toBe('natural');
      expect(result.target).toBe('http://example.com');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    test('should detect HTTPS URL target', () => {
      const result = parser.parse('test https://secure.example.com');
      expect(result.type).toBe('natural');
      expect(result.target).toBe('https://secure.example.com');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    test('should normalize domain to HTTPS', () => {
      const result = parser.parse('analyze example.com');
      expect(result.type).toBe('natural');
      expect(result.target).toBe('https://example.com');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    test('should handle subdomain targets', () => {
      const result = parser.parse('scan api.v2.example.com');
      expect(result.type).toBe('natural');
      expect(result.target).toBe('https://api.v2.example.com');
    });
  });

  describe('Natural Language - IP Address Detection', () => {
    test('should detect IP address target', () => {
      const result = parser.parse('scan 192.168.1.1');
      expect(result.type).toBe('natural');
      expect(result.target).toBe('192.168.1.1');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    test('should handle IP with action verb', () => {
      const result = parser.parse('analyze 10.0.0.1');
      expect(result.type).toBe('natural');
      expect(result.target).toBe('10.0.0.1');
    });

    test('should detect public IP addresses', () => {
      const result = parser.parse('check 8.8.8.8');
      expect(result.type).toBe('natural');
      expect(result.target).toBe('8.8.8.8');
    });
  });

  describe('Natural Language - Action Verbs', () => {
    test('should recognize scan action', () => {
      const result = parser.parse('scan example.com');
      expect(result.type).toBe('natural');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    test('should recognize test action', () => {
      const result = parser.parse('test https://example.com');
      expect(result.type).toBe('natural');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    test('should recognize analyze action', () => {
      const result = parser.parse('analyze example.com');
      expect(result.type).toBe('natural');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    test('should recognize check action', () => {
      const result = parser.parse('check example.com');
      expect(result.type).toBe('natural');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    test('should recognize audit action', () => {
      const result = parser.parse('audit example.com');
      expect(result.type).toBe('natural');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    test('should recognize review action', () => {
      const result = parser.parse('review example.com');
      expect(result.type).toBe('natural');
      expect(result.confidence).toBeGreaterThan(0.5);
    });
  });

  describe('Natural Language - Objective Extraction', () => {
    test('should extract objective with "for" keyword', () => {
      const result = parser.parse('scan example.com for SQL injection');
      expect(result.type).toBe('natural');
      expect(result.target).toBe('https://example.com');
      expect(result.objective).toBe('SQL injection');
    });

    test('should extract objective with "focusing on" keyword', () => {
      const result = parser.parse('analyze example.com focusing on XSS');
      expect(result.type).toBe('natural');
      expect(result.objective).toBe('XSS');
    });

    test('should extract objective with "looking for" keyword', () => {
      const result = parser.parse('test example.com looking for vulnerabilities');
      expect(result.type).toBe('natural');
      expect(result.objective).toBe('vulnerabilities');
    });
  });

  describe('Module Management', () => {
    test('should set available modules', () => {
      parser.setAvailableModules(['general', 'ctf', 'threat_emulation']);
      const modules = parser.getAvailableModules();
      expect(modules).toEqual(['general', 'ctf', 'threat_emulation']);
    });

    test('should get empty modules list initially', () => {
      const modules = parser.getAvailableModules();
      expect(modules).toEqual([]);
    });

    test('should get module description', () => {
      const description = parser.getModuleDescription('general');
      expect(description).toBeTruthy();
      expect(typeof description).toBe('string');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle mixed case input', () => {
      const result = parser.parse('SCAN Example.COM');
      expect(result.type).toBe('natural');
    });

    test('should handle extra whitespace', () => {
      const result = parser.parse('  scan   example.com  ');
      expect(result.type).toBe('natural');
      expect(result.target).toBeTruthy();
    });

    test('should handle unknown command gracefully', () => {
      const result = parser.parse('random text that is not a command');
      expect(result.type).toBe('unknown');
      expect(result.confidence).toBe(0);
    });

    test('should return low confidence for ambiguous input', () => {
      const result = parser.parse('something vague');
      expect(result.confidence).toBeLessThanOrEqual(0.5);
    });

    test('should handle special characters in target', () => {
      const result = parser.parse('scan https://example.com:8080/path');
      expect(result.type).toBe('natural');
      expect(result.target).toContain('example.com');
    });
  });

  describe('Complex Natural Language Patterns', () => {
    test('should parse complex scan command with objective', () => {
      const result = parser.parse('scan https://api.example.com for authentication bypass');
      expect(result.type).toBe('natural');
      expect(result.target).toBe('https://api.example.com');
      expect(result.objective).toBe('authentication bypass');
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    test('should handle multiple word objectives', () => {
      const result = parser.parse('analyze example.com focusing on security misconfigurations and vulnerabilities');
      expect(result.type).toBe('natural');
      expect(result.objective).toContain('misconfigurations');
    });

    test('should parse search patterns', () => {
      const result = parser.parse('find vulnerabilities in example.com');
      expect(result.type).toBe('natural');
      expect(result.target).toBe('https://example.com');
    });
  });
});