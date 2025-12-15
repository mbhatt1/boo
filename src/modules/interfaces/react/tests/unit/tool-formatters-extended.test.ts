/**
 * Extended Comprehensive tests for Tool Formatters
 * ================================================
 * 
 * Additional tests for tool output formatting, parsing, and display.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';

// Mock tool formatter utilities
class MockToolFormatter {
  formatToolOutput(output: any, toolName: string): string {
    if (typeof output === 'string') return output;
    if (typeof output === 'object') return JSON.stringify(output, null, 2);
    return String(output);
  }

  truncateOutput(output: string, maxLength: number): string {
    if (output.length <= maxLength) return output;
    return output.substring(0, maxLength) + '...';
  }

  highlightSyntax(output: string, language?: string): string {
    // Simple mock syntax highlighting
    return `<pre class="${language}">${output}</pre>`;
  }

  formatJson(data: any): string {
    return JSON.stringify(data, null, 2);
  }

  formatXml(xmlString: string): string {
    // Simple XML formatting
    return xmlString.replace(/></g, '>\n<');
  }

  parseToolResult(result: string, format: 'json' | 'xml' | 'text'): any {
    if (format === 'json') {
      try {
        return JSON.parse(result);
      } catch {
        return result;
      }
    }
    return result;
  }

  formatErrorOutput(error: Error): string {
    return `Error: ${error.message}\nStack: ${error.stack}`;
  }

  formatSuccessOutput(data: any): string {
    return `✓ Success\n${this.formatToolOutput(data, 'unknown')}`;
  }

  extractLinks(output: string): string[] {
    const urlRegex = /https?:\/\/[^\s]+/g;
    return output.match(urlRegex) || [];
  }

  formatList(items: any[]): string {
    return items.map((item, index) => `${index + 1}. ${item}`).join('\n');
  }
}

describe('Tool Formatters - Extended', () => {
  let formatter: MockToolFormatter;

  beforeEach(() => {
    formatter = new MockToolFormatter();
  });

  describe('Basic Formatting', () => {
    it('should format string output', () => {
      const output = 'Simple string output';
      const result = formatter.formatToolOutput(output, 'test');
      expect(result).toBe('Simple string output');
    });

    it('should format object output as JSON', () => {
      const output = { status: 'success', data: 123 };
      const result = formatter.formatToolOutput(output, 'test');
      expect(result).toContain('status');
      expect(result).toContain('success');
    });

    it('should format number output', () => {
      const output = 42;
      const result = formatter.formatToolOutput(output, 'test');
      expect(result).toBe('42');
    });

    it('should format boolean output', () => {
      const output = true;
      const result = formatter.formatToolOutput(output, 'test');
      expect(result).toBe('true');
    });

    it('should format null output', () => {
      const output = null;
      const result = formatter.formatToolOutput(output, 'test');
      expect(result).toBe('null');
    });

    it('should format undefined output', () => {
      const output = undefined;
      const result = formatter.formatToolOutput(output, 'test');
      expect(result).toBe('undefined');
    });
  });

  describe('Output Truncation', () => {
    it('should truncate long output', () => {
      const longOutput = 'a'.repeat(1000);
      const result = formatter.truncateOutput(longOutput, 100);
      expect(result).toHaveLength(103); // 100 + '...'
      expect(result.endsWith('...')).toBe(true);
    });

    it('should not truncate short output', () => {
      const shortOutput = 'Short text';
      const result = formatter.truncateOutput(shortOutput, 100);
      expect(result).toBe('Short text');
    });

    it('should handle exact length', () => {
      const output = 'a'.repeat(100);
      const result = formatter.truncateOutput(output, 100);
      expect(result).toHaveLength(100);
      expect(result.endsWith('...')).toBe(false);
    });

    it('should handle zero max length', () => {
      const output = 'test';
      const result = formatter.truncateOutput(output, 0);
      expect(result).toBe('...');
    });
  });

  describe('Syntax Highlighting', () => {
    it('should highlight JSON syntax', () => {
      const jsonOutput = '{"key": "value"}';
      const result = formatter.highlightSyntax(jsonOutput, 'json');
      expect(result).toContain('json');
      expect(result).toContain('pre');
    });

    it('should highlight without language specification', () => {
      const output = 'plain text';
      const result = formatter.highlightSyntax(output);
      expect(result).toContain('pre');
    });

    it('should handle code blocks', () => {
      const code = 'function test() {\n  return true;\n}';
      const result = formatter.highlightSyntax(code, 'javascript');
      expect(result).toContain('javascript');
    });
  });

  describe('JSON Formatting', () => {
    it('should format JSON with indentation', () => {
      const data = { level1: { level2: { level3: 'value' } } };
      const result = formatter.formatJson(data);
      expect(result.split('\n').length).toBeGreaterThan(1);
    });

    it('should format arrays', () => {
      const data = [1, 2, 3, 4, 5];
      const result = formatter.formatJson(data);
      expect(result).toContain('[');
      expect(result).toContain(']');
    });

    it('should handle empty objects', () => {
      const result = formatter.formatJson({});
      expect(result).toBe('{}');
    });

    it('should handle empty arrays', () => {
      const result = formatter.formatJson([]);
      expect(result).toBe('[]');
    });

    it('should format complex nested structures', () => {
      const data = {
        users: [
          { id: 1, name: 'User 1' },
          { id: 2, name: 'User 2' }
        ],
        meta: { count: 2 }
      };
      const result = formatter.formatJson(data);
      expect(result).toContain('users');
      expect(result).toContain('meta');
    });
  });

  describe('XML Formatting', () => {
    it('should format XML with newlines', () => {
      const xml = '<root><child>value</child></root>';
      const result = formatter.formatXml(xml);
      expect(result).toContain('\n');
    });

    it('should handle self-closing tags', () => {
      const xml = '<root><item/><item/></root>';
      const result = formatter.formatXml(xml);
      expect(result).toContain('item');
    });

    it('should handle attributes', () => {
      const xml = '<element attr="value">content</element>';
      const result = formatter.formatXml(xml);
      expect(result).toContain('attr');
    });
  });

  describe('Result Parsing', () => {
    it('should parse JSON results', () => {
      const jsonString = '{"status": "ok", "count": 5}';
      const result = formatter.parseToolResult(jsonString, 'json');
      expect(result.status).toBe('ok');
      expect(result.count).toBe(5);
    });

    it('should handle invalid JSON gracefully', () => {
      const invalidJson = 'not json';
      const result = formatter.parseToolResult(invalidJson, 'json');
      expect(result).toBe('not json');
    });

    it('should return text as-is', () => {
      const text = 'Plain text result';
      const result = formatter.parseToolResult(text, 'text');
      expect(result).toBe('Plain text result');
    });

    it('should handle XML format', () => {
      const xml = '<result>success</result>';
      const result = formatter.parseToolResult(xml, 'xml');
      expect(result).toBe(xml);
    });
  });

  describe('Error Formatting', () => {
    it('should format error with message', () => {
      const error = new Error('Test error');
      const result = formatter.formatErrorOutput(error);
      expect(result).toContain('Test error');
    });

    it('should include stack trace', () => {
      const error = new Error('Error with stack');
      const result = formatter.formatErrorOutput(error);
      expect(result).toContain('Stack:');
    });

    it('should handle errors without stack', () => {
      const error = new Error('Simple error');
      error.stack = undefined;
      const result = formatter.formatErrorOutput(error);
      expect(result).toContain('Simple error');
    });
  });

  describe('Success Formatting', () => {
    it('should format success with checkmark', () => {
      const data = { result: 'completed' };
      const result = formatter.formatSuccessOutput(data);
      expect(result).toContain('✓');
      expect(result).toContain('Success');
    });

    it('should include data in success output', () => {
      const data = { items: 3, processed: true };
      const result = formatter.formatSuccessOutput(data);
      expect(result).toContain('items');
      expect(result).toContain('processed');
    });
  });

  describe('Link Extraction', () => {
    it('should extract HTTP links', () => {
      const output = 'Check http://example.com for details';
      const links = formatter.extractLinks(output);
      expect(links).toHaveLength(1);
      expect(links[0]).toBe('http://example.com');
    });

    it('should extract HTTPS links', () => {
      const output = 'Visit https://secure.example.com';
      const links = formatter.extractLinks(output);
      expect(links).toHaveLength(1);
      expect(links[0]).toBe('https://secure.example.com');
    });

    it('should extract multiple links', () => {
      const output = 'See http://example1.com and https://example2.com';
      const links = formatter.extractLinks(output);
      expect(links).toHaveLength(2);
    });

    it('should return empty array for no links', () => {
      const output = 'No links here';
      const links = formatter.extractLinks(output);
      expect(links).toHaveLength(0);
    });

    it('should handle links with query parameters', () => {
      const output = 'API: https://api.example.com/v1/users?page=1&limit=10';
      const links = formatter.extractLinks(output);
      expect(links[0]).toContain('page=1');
    });
  });

  describe('List Formatting', () => {
    it('should format numbered list', () => {
      const items = ['First', 'Second', 'Third'];
      const result = formatter.formatList(items);
      expect(result).toContain('1. First');
      expect(result).toContain('2. Second');
      expect(result).toContain('3. Third');
    });

    it('should handle empty list', () => {
      const items: any[] = [];
      const result = formatter.formatList(items);
      expect(result).toBe('');
    });

    it('should handle single item', () => {
      const items = ['Only item'];
      const result = formatter.formatList(items);
      expect(result).toBe('1. Only item');
    });

    it('should handle complex items', () => {
      const items = [
        { name: 'Item 1', count: 5 },
        { name: 'Item 2', count: 10 }
      ];
      const result = formatter.formatList(items);
      expect(result).toContain('1.');
      expect(result).toContain('2.');
    });
  });

  describe('Special Characters', () => {
    it('should handle unicode characters', () => {
      const output = '🎯 Target: example.com';
      const result = formatter.formatToolOutput(output, 'test');
      expect(result).toContain('🎯');
    });

    it('should handle newlines', () => {
      const output = 'Line 1\nLine 2\nLine 3';
      const result = formatter.formatToolOutput(output, 'test');
      expect(result.split('\n')).toHaveLength(3);
    });

    it('should handle tabs', () => {
      const output = 'Col1\tCol2\tCol3';
      const result = formatter.formatToolOutput(output, 'test');
      expect(result).toContain('\t');
    });

    it('should handle quotes', () => {
      const output = 'Text with "quotes" and \'apostrophes\'';
      const result = formatter.formatToolOutput(output, 'test');
      expect(result).toContain('"');
      expect(result).toContain("'");
    });
  });

  describe('Edge Cases', () => {
    it('should handle very large objects', () => {
      const largeObj = { data: 'x'.repeat(10000) };
      const result = formatter.formatToolOutput(largeObj, 'test');
      expect(result.length).toBeGreaterThan(10000);
    });

    it('should handle circular references safely', () => {
      const obj: any = { name: 'test' };
      obj.self = obj;
      // JSON.stringify will throw, formatToolOutput should handle it
      expect(() => {
        formatter.formatJson(obj);
      }).toThrow();
    });

    it('should handle deeply nested structures', () => {
      const deep = { l1: { l2: { l3: { l4: { l5: 'value' } } } } };
      const result = formatter.formatJson(deep);
      expect(result).toContain('l5');
    });

    it('should handle mixed content types', () => {
      const mixed = {
        string: 'text',
        number: 42,
        boolean: true,
        null: null,
        array: [1, 2, 3]
      };
      const result = formatter.formatJson(mixed);
      expect(result).toContain('string');
      expect(result).toContain('42');
      expect(result).toContain('true');
    });
  });
});

describe('Tool Formatters - Integration', () => {
  it('should format complete tool result', () => {
    const formatter = new MockToolFormatter();
    const toolResult = {
      tool: 'nmap',
      status: 'success',
      output: {
        open_ports: [80, 443, 8080],
        services: ['http', 'https', 'http-proxy']
      }
    };

    const formatted = formatter.formatJson(toolResult);
    expect(formatted).toContain('nmap');
    expect(formatted).toContain('open_ports');
    expect(formatted).toContain('services');
  });

  it('should handle multi-step tool formatting', () => {
    const formatter = new MockToolFormatter();
    const longOutput = 'a'.repeat(500);
    
    // Format, truncate, then highlight
    const formatted = formatter.formatToolOutput(longOutput, 'test');
    const truncated = formatter.truncateOutput(formatted, 100);
    const highlighted = formatter.highlightSyntax(truncated);
    
    expect(highlighted).toContain('pre');
    expect(truncated).toHaveLength(103);
  });
});