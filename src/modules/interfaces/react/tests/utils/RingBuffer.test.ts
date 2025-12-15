/**
 * Comprehensive unit tests for RingBuffer utility
 * Testing circular buffer functionality, overflow handling, and edge cases
 */

import { RingBuffer } from '../../src/utils/RingBuffer';

describe('RingBuffer', () => {
  describe('Constructor and Initialization', () => {
    test('should create buffer with specified capacity', () => {
      const buffer = new RingBuffer<number>(5);
      expect(buffer.capacity).toBe(5);
      expect(buffer.size).toBe(0);
      expect(buffer.isEmpty()).toBe(true);
    });

    test('should throw error for invalid capacity', () => {
      expect(() => new RingBuffer<number>(0)).toThrow();
      expect(() => new RingBuffer<number>(-1)).toThrow();
    });

    test('should handle capacity of 1', () => {
      const buffer = new RingBuffer<number>(1);
      expect(buffer.capacity).toBe(1);
    });
  });

  describe('Push Operations', () => {
    test('should push single item', () => {
      const buffer = new RingBuffer<number>(3);
      buffer.push(1);
      expect(buffer.size).toBe(1);
      expect(buffer.isEmpty()).toBe(false);
    });

    test('should push multiple items', () => {
      const buffer = new RingBuffer<number>(5);
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);
      expect(buffer.size).toBe(3);
    });

    test('should handle overflow by overwriting oldest', () => {
      const buffer = new RingBuffer<number>(3);
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);
      buffer.push(4); // Should overwrite 1
      expect(buffer.size).toBe(3);
      expect(buffer.toArray()).toEqual([2, 3, 4]);
    });

    test('should push different data types', () => {
      const stringBuffer = new RingBuffer<string>(3);
      stringBuffer.push('a');
      stringBuffer.push('b');
      expect(stringBuffer.toArray()).toEqual(['a', 'b']);
    });
  });

  describe('Pop Operations', () => {
    test('should pop item from buffer', () => {
      const buffer = new RingBuffer<number>(3);
      buffer.push(1);
      buffer.push(2);
      const item = buffer.pop();
      expect(item).toBe(2);
      expect(buffer.size).toBe(1);
    });

    test('should return undefined for empty buffer', () => {
      const buffer = new RingBuffer<number>(3);
      expect(buffer.pop()).toBeUndefined();
    });

    test('should handle sequential push and pop', () => {
      const buffer = new RingBuffer<number>(3);
      buffer.push(1);
      expect(buffer.pop()).toBe(1);
      buffer.push(2);
      expect(buffer.pop()).toBe(2);
      expect(buffer.isEmpty()).toBe(true);
    });
  });

  describe('Peek Operations', () => {
    test('should peek at newest item without removing', () => {
      const buffer = new RingBuffer<number>(3);
      buffer.push(1);
      buffer.push(2);
      expect(buffer.peek()).toBe(2);
      expect(buffer.size).toBe(2); // Size unchanged
    });

    test('should return undefined for empty buffer', () => {
      const buffer = new RingBuffer<number>(3);
      expect(buffer.peek()).toBeUndefined();
    });

    test('should peek after overflow', () => {
      const buffer = new RingBuffer<number>(2);
      buffer.push(1);
      buffer.push(2);
      buffer.push(3); // Overflows
      expect(buffer.peek()).toBe(3);
    });
  });

  describe('Clear Operations', () => {
    test('should clear all items', () => {
      const buffer = new RingBuffer<number>(3);
      buffer.push(1);
      buffer.push(2);
      buffer.clear();
      expect(buffer.size).toBe(0);
      expect(buffer.isEmpty()).toBe(true);
    });

    test('should allow push after clear', () => {
      const buffer = new RingBuffer<number>(3);
      buffer.push(1);
      buffer.clear();
      buffer.push(2);
      expect(buffer.size).toBe(1);
      expect(buffer.peek()).toBe(2);
    });
  });

  describe('ToArray Conversion', () => {
    test('should convert to array in correct order', () => {
      const buffer = new RingBuffer<number>(5);
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);
      expect(buffer.toArray()).toEqual([1, 2, 3]);
    });

    test('should handle toArray after overflow', () => {
      const buffer = new RingBuffer<number>(3);
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);
      buffer.push(4);
      buffer.push(5);
      expect(buffer.toArray()).toEqual([3, 4, 5]);
    });

    test('should return empty array for empty buffer', () => {
      const buffer = new RingBuffer<number>(3);
      expect(buffer.toArray()).toEqual([]);
    });
  });

  describe('Edge Cases', () => {
    test('should handle rapid push/pop cycles', () => {
      const buffer = new RingBuffer<number>(3);
      for (let i = 0; i < 100; i++) {
        buffer.push(i);
        if (i % 2 === 0) {
          buffer.pop();
        }
      }
      expect(buffer.size).toBeGreaterThanOrEqual(0);
    });

    test('should maintain integrity with mixed operations', () => {
      const buffer = new RingBuffer<number>(5);
      buffer.push(1);
      buffer.push(2);
      buffer.pop();
      buffer.push(3);
      buffer.clear();
      buffer.push(4);
      expect(buffer.peek()).toBe(4);
      expect(buffer.size).toBe(1);
    });

    test('should handle object types', () => {
      interface TestObj {
        id: number;
        name: string;
      }
      const buffer = new RingBuffer<TestObj>(2);
      buffer.push({ id: 1, name: 'test1' });
      buffer.push({ id: 2, name: 'test2' });
      const result = buffer.peek();
      expect(result?.id).toBe(2);
      expect(result?.name).toBe('test2');
    });
  });

  describe('Capacity Management', () => {
    test('should report correct isFull status', () => {
      const buffer = new RingBuffer<number>(2);
      expect(buffer.isFull()).toBe(false);
      buffer.push(1);
      expect(buffer.isFull()).toBe(false);
      buffer.push(2);
      expect(buffer.isFull()).toBe(true);
    });

    test('should maintain isFull after overflow', () => {
      const buffer = new RingBuffer<number>(2);
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);
      expect(buffer.isFull()).toBe(true);
      expect(buffer.size).toBe(2);
    });
  });
});