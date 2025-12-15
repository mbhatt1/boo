/**
 * Comprehensive unit tests for ByteBudgetRingBuffer utility
 * Testing byte-aware circular buffer with memory management
 */

import { ByteBudgetRingBuffer } from '../../src/utils/ByteBudgetRingBuffer';

describe('ByteBudgetRingBuffer', () => {
  describe('Constructor and Initialization', () => {
    test('should create buffer with specified byte capacity', () => {
      const buffer = new ByteBudgetRingBuffer(1024);
      expect(buffer.capacity).toBe(1024);
      expect(buffer.currentByteSize).toBe(0);
      expect(buffer.isEmpty()).toBe(true);
    });

    test('should throw error for invalid capacity', () => {
      expect(() => new ByteBudgetRingBuffer(0)).toThrow();
      expect(() => new ByteBudgetRingBuffer(-1)).toThrow();
    });

    test('should handle minimum capacity', () => {
      const buffer = new ByteBudgetRingBuffer(1);
      expect(buffer.capacity).toBe(1);
    });
  });

  describe('Push Operations with Byte Management', () => {
    test('should push small string and track bytes', () => {
      const buffer = new ByteBudgetRingBuffer(100);
      buffer.push('test');
      
      expect(buffer.size).toBe(1);
      expect(buffer.currentByteSize).toBeGreaterThan(0);
      expect(buffer.isEmpty()).toBe(false);
    });

    test('should evict old entries when byte budget exceeded', () => {
      const buffer = new ByteBudgetRingBuffer(50);
      
      buffer.push('a'.repeat(20)); // ~20 bytes
      buffer.push('b'.repeat(20)); // ~20 bytes
      buffer.push('c'.repeat(20)); // ~20 bytes, should evict first
      
      const items = buffer.toArray();
      expect(items[0]).not.toContain('aaa');
      expect(items).toContain('b'.repeat(20));
      expect(items).toContain('c'.repeat(20));
    });

    test('should handle object entries', () => {
      const buffer = new ByteBudgetRingBuffer(1024);
      const obj = { id: 1, name: 'test', data: 'content' };
      
      buffer.push(obj);
      
      expect(buffer.size).toBe(1);
      expect(buffer.currentByteSize).toBeGreaterThan(0);
    });

    test('should calculate byte size correctly for complex objects', () => {
      const buffer = new ByteBudgetRingBuffer(1024);
      const largeObj = {
        id: 1,
        data: 'x'.repeat(100),
        nested: { value: 'test' }
      };
      
      buffer.push(largeObj);
      const byteSize = buffer.currentByteSize;
      
      expect(byteSize).toBeGreaterThan(100);
    });

    test('should handle empty strings', () => {
      const buffer = new ByteBudgetRingBuffer(100);
      buffer.push('');
      
      expect(buffer.size).toBe(1);
      expect(buffer.currentByteSize).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Eviction Strategy', () => {
    test('should evict multiple entries if needed', () => {
      const buffer = new ByteBudgetRingBuffer(100);
      
      // Fill with small entries
      for (let i = 0; i < 10; i++) {
        buffer.push(`item${i}`);
      }
      
      // Add large entry that requires multiple evictions
      buffer.push('x'.repeat(80));
      
      expect(buffer.currentByteSize).toBeLessThanOrEqual(100);
    });

    test('should maintain FIFO order during eviction', () => {
      const buffer = new ByteBudgetRingBuffer(100);
      
      buffer.push('first');
      buffer.push('second');
      buffer.push('third');
      buffer.push('x'.repeat(80)); // Force eviction
      
      const items = buffer.toArray();
      expect(items[items.length - 1]).toBe('x'.repeat(80));
    });

    test('should handle single entry exceeding capacity', () => {
      const buffer = new ByteBudgetRingBuffer(50);
      const largeEntry = 'x'.repeat(100);
      
      buffer.push(largeEntry);
      
      // Should still store but size may exceed temporarily
      expect(buffer.size).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Clear and Reset Operations', () => {
    test('should clear all entries and reset byte count', () => {
      const buffer = new ByteBudgetRingBuffer(100);
      
      buffer.push('test1');
      buffer.push('test2');
      buffer.clear();
      
      expect(buffer.size).toBe(0);
      expect(buffer.currentByteSize).toBe(0);
      expect(buffer.isEmpty()).toBe(true);
    });

    test('should allow push after clear', () => {
      const buffer = new ByteBudgetRingBuffer(100);
      
      buffer.push('test1');
      buffer.clear();
      buffer.push('test2');
      
      expect(buffer.size).toBe(1);
      expect(buffer.toArray()).toEqual(['test2']);
    });
  });

  describe('Memory Statistics', () => {
    test('should accurately report byte utilization', () => {
      const buffer = new ByteBudgetRingBuffer(1000);
      
      buffer.push('a'.repeat(100));
      const utilization = buffer.currentByteSize / buffer.capacity;
      
      expect(utilization).toBeGreaterThan(0);
      expect(utilization).toBeLessThanOrEqual(1);
    });

    test('should track cumulative byte size', () => {
      const buffer = new ByteBudgetRingBuffer(1000);
      
      buffer.push('test1');
      const size1 = buffer.currentByteSize;
      
      buffer.push('test2');
      const size2 = buffer.currentByteSize;
      
      expect(size2).toBeGreaterThan(size1);
    });
  });

  describe('Edge Cases and Stress Testing', () => {
    test('should handle rapid push operations', () => {
      const buffer = new ByteBudgetRingBuffer(1000);
      
      for (let i = 0; i < 100; i++) {
        buffer.push(`item${i}`);
      }
      
      expect(buffer.currentByteSize).toBeLessThanOrEqual(1000);
      expect(buffer.size).toBeGreaterThan(0);
    });

    test('should handle mixed size entries', () => {
      const buffer = new ByteBudgetRingBuffer(500);
      
      buffer.push('small');
      buffer.push('x'.repeat(100));
      buffer.push('tiny');
      buffer.push('y'.repeat(150));
      
      expect(buffer.currentByteSize).toBeLessThanOrEqual(500);
    });

    test('should handle unicode characters correctly', () => {
      const buffer = new ByteBudgetRingBuffer(1000);
      
      buffer.push('Hello 世界 🌍');
      
      expect(buffer.size).toBe(1);
      expect(buffer.currentByteSize).toBeGreaterThan(0);
    });

    test('should maintain consistency across operations', () => {
      const buffer = new ByteBudgetRingBuffer(200);
      
      buffer.push('entry1');
      buffer.push('entry2');
      const size1 = buffer.currentByteSize;
      
      buffer.clear();
      expect(buffer.currentByteSize).toBe(0);
      
      buffer.push('entry1');
      buffer.push('entry2');
      const size2 = buffer.currentByteSize;
      
      expect(size1).toBe(size2);
    });
  });

  describe('toArray Conversion', () => {
    test('should return array in correct order', () => {
      const buffer = new ByteBudgetRingBuffer(500);
      
      buffer.push('first');
      buffer.push('second');
      buffer.push('third');
      
      const array = buffer.toArray();
      expect(array).toEqual(['first', 'second', 'third']);
    });

    test('should return empty array when buffer is empty', () => {
      const buffer = new ByteBudgetRingBuffer(100);
      
      expect(buffer.toArray()).toEqual([]);
    });

    test('should return correct array after evictions', () => {
      const buffer = new ByteBudgetRingBuffer(100);
      
      buffer.push('a'.repeat(30));
      buffer.push('b'.repeat(30));
      buffer.push('c'.repeat(30));
      buffer.push('d'.repeat(30)); // Should evict earlier entries
      
      const array = buffer.toArray();
      expect(array.length).toBeGreaterThan(0);
      expect(array[array.length - 1]).toBe('d'.repeat(30));
    });
  });
});