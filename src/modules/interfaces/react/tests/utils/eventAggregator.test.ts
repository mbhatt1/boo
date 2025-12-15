/**
 * Comprehensive tests for EventAggregator
 * =======================================
 * 
 * Tests for event batching, aggregation, and processing.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

interface Event {
  id: string;
  type: string;
  data: any;
  timestamp: number;
}

interface AggregatedBatch {
  events: Event[];
  count: number;
  startTime: number;
  endTime: number;
}

class MockEventAggregator {
  private buffer: Event[] = [];
  private batchSize: number;
  private flushInterval: number;
  private intervalId?: NodeJS.Timeout;
  private onBatchReady?: (batch: AggregatedBatch) => void;

  constructor(batchSize: number = 10, flushInterval: number = 1000) {
    this.batchSize = batchSize;
    this.flushInterval = flushInterval;
  }

  addEvent(event: Omit<Event, 'timestamp' | 'id'>): void {
    const fullEvent: Event = {
      ...event,
      id: `${Date.now()}-${Math.random()}`,
      timestamp: Date.now()
    };
    
    this.buffer.push(fullEvent);

    if (this.buffer.length >= this.batchSize) {
      this.flush();
    }
  }

  flush(): AggregatedBatch | null {
    if (this.buffer.length === 0) return null;

    const batch: AggregatedBatch = {
      events: [...this.buffer],
      count: this.buffer.length,
      startTime: this.buffer[0].timestamp,
      endTime: this.buffer[this.buffer.length - 1].timestamp
    };

    this.buffer = [];

    if (this.onBatchReady) {
      this.onBatchReady(batch);
    }

    return batch;
  }

  startAutoFlush(callback: (batch: AggregatedBatch) => void): void {
    this.onBatchReady = callback;
    this.intervalId = setInterval(() => {
      this.flush();
    }, this.flushInterval);
  }

  stopAutoFlush(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    this.onBatchReady = undefined;
  }

  getBufferSize(): number {
    return this.buffer.length;
  }

  clear(): void {
    this.buffer = [];
  }

  aggregateByType(events: Event[]): Map<string, Event[]> {
    const aggregated = new Map<string, Event[]>();
    for (const event of events) {
      const existing = aggregated.get(event.type) || [];
      existing.push(event);
      aggregated.set(event.type, existing);
    }
    return aggregated;
  }
}

describe('EventAggregator', () => {
  let aggregator: MockEventAggregator;

  beforeEach(() => {
    aggregator = new MockEventAggregator(5, 500);
  });

  afterEach(() => {
    aggregator.stopAutoFlush();
  });

  describe('Event Addition', () => {
    it('should add events to buffer', () => {
      aggregator.addEvent({ type: 'test', data: {} });
      expect(aggregator.getBufferSize()).toBe(1);
    });

    it('should add multiple events', () => {
      aggregator.addEvent({ type: 'test1', data: {} });
      aggregator.addEvent({ type: 'test2', data: {} });
      aggregator.addEvent({ type: 'test3', data: {} });
      expect(aggregator.getBufferSize()).toBe(3);
    });

    it('should auto-generate event IDs', () => {
      aggregator.addEvent({ type: 'test', data: {} });
      const batch = aggregator.flush();
      expect(batch?.events[0].id).toBeDefined();
    });

    it('should auto-generate timestamps', () => {
      aggregator.addEvent({ type: 'test', data: {} });
      const batch = aggregator.flush();
      expect(batch?.events[0].timestamp).toBeDefined();
    });
  });

  describe('Batch Flushing', () => {
    it('should flush when batch size reached', () => {
      for (let i = 0; i < 5; i++) {
        aggregator.addEvent({ type: 'test', data: { index: i } });
      }
      expect(aggregator.getBufferSize()).toBe(0);
    });

    it('should return batch on flush', () => {
      aggregator.addEvent({ type: 'test', data: {} });
      const batch = aggregator.flush();
      expect(batch).toBeDefined();
      expect(batch?.count).toBe(1);
    });

    it('should clear buffer after flush', () => {
      aggregator.addEvent({ type: 'test', data: {} });
      aggregator.flush();
      expect(aggregator.getBufferSize()).toBe(0);
    });

    it('should return null on empty flush', () => {
      const batch = aggregator.flush();
      expect(batch).toBeNull();
    });

    it('should include all events in batch', () => {
      aggregator.addEvent({ type: 'test1', data: {} });
      aggregator.addEvent({ type: 'test2', data: {} });
      const batch = aggregator.flush();
      expect(batch?.events).toHaveLength(2);
    });
  });

  describe('Auto Flush', () => {
    it('should auto flush on interval', (done) => {
      let batchReceived = false;
      aggregator.startAutoFlush(() => {
        batchReceived = true;
      });

      aggregator.addEvent({ type: 'test', data: {} });

      setTimeout(() => {
        expect(batchReceived).toBe(true);
        done();
      }, 600);
    });

    it('should call callback with batch', (done) => {
      aggregator.startAutoFlush((batch) => {
        expect(batch.count).toBeGreaterThan(0);
        done();
      });

      aggregator.addEvent({ type: 'test', data: {} });
    });

    it('should stop auto flush', (done) => {
      let callCount = 0;
      aggregator.startAutoFlush(() => {
        callCount++;
      });

      aggregator.addEvent({ type: 'test', data: {} });

      setTimeout(() => {
        aggregator.stopAutoFlush();
        const countAfterStop = callCount;

        setTimeout(() => {
          expect(callCount).toBe(countAfterStop);
          done();
        }, 600);
      }, 600);
    });
  });

  describe('Batch Metadata', () => {
    it('should include start time', () => {
      aggregator.addEvent({ type: 'test', data: {} });
      const batch = aggregator.flush();
      expect(batch?.startTime).toBeDefined();
    });

    it('should include end time', () => {
      aggregator.addEvent({ type: 'test1', data: {} });
      aggregator.addEvent({ type: 'test2', data: {} });
      const batch = aggregator.flush();
      expect(batch?.endTime).toBeDefined();
      expect(batch!.endTime).toBeGreaterThanOrEqual(batch!.startTime);
    });

    it('should include event count', () => {
      aggregator.addEvent({ type: 'test1', data: {} });
      aggregator.addEvent({ type: 'test2', data: {} });
      const batch = aggregator.flush();
      expect(batch?.count).toBe(2);
    });
  });

  describe('Event Aggregation', () => {
    it('should aggregate events by type', () => {
      const events: Event[] = [
        { id: '1', type: 'click', data: {}, timestamp: Date.now() },
        { id: '2', type: 'click', data: {}, timestamp: Date.now() },
        { id: '3', type: 'scroll', data: {}, timestamp: Date.now() }
      ];

      const aggregated = aggregator.aggregateByType(events);
      expect(aggregated.get('click')).toHaveLength(2);
      expect(aggregated.get('scroll')).toHaveLength(1);
    });

    it('should handle empty event list', () => {
      const aggregated = aggregator.aggregateByType([]);
      expect(aggregated.size).toBe(0);
    });

    it('should handle single event type', () => {
      const events: Event[] = [
        { id: '1', type: 'test', data: {}, timestamp: Date.now() },
        { id: '2', type: 'test', data: {}, timestamp: Date.now() }
      ];

      const aggregated = aggregator.aggregateByType(events);
      expect(aggregated.size).toBe(1);
      expect(aggregated.get('test')).toHaveLength(2);
    });
  });

  describe('Buffer Management', () => {
    it('should report correct buffer size', () => {
      aggregator.addEvent({ type: 'test', data: {} });
      aggregator.addEvent({ type: 'test', data: {} });
      expect(aggregator.getBufferSize()).toBe(2);
    });

    it('should clear buffer', () => {
      aggregator.addEvent({ type: 'test', data: {} });
      aggregator.clear();
      expect(aggregator.getBufferSize()).toBe(0);
    });

    it('should maintain buffer order', () => {
      aggregator.addEvent({ type: 'test1', data: { order: 1 } });
      aggregator.addEvent({ type: 'test2', data: { order: 2 } });
      aggregator.addEvent({ type: 'test3', data: { order: 3 } });
      const batch = aggregator.flush();
      expect(batch?.events[0].data.order).toBe(1);
      expect(batch?.events[2].data.order).toBe(3);
    });
  });

  describe('Configuration', () => {
    it('should respect custom batch size', () => {
      const customAggregator = new MockEventAggregator(3, 1000);
      customAggregator.addEvent({ type: 'test', data: {} });
      customAggregator.addEvent({ type: 'test', data: {} });
      expect(customAggregator.getBufferSize()).toBe(2);
      customAggregator.addEvent({ type: 'test', data: {} });
      expect(customAggregator.getBufferSize()).toBe(0);
    });

    it('should respect custom flush interval', (done) => {
      const fastAggregator = new MockEventAggregator(10, 100);
      let flushed = false;

      fastAggregator.startAutoFlush(() => {
        flushed = true;
      });

      fastAggregator.addEvent({ type: 'test', data: {} });

      setTimeout(() => {
        expect(flushed).toBe(true);
        fastAggregator.stopAutoFlush();
        done();
      }, 150);
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapid event addition', () => {
      for (let i = 0; i < 100; i++) {
        aggregator.addEvent({ type: 'test', data: { index: i } });
      }
      expect(aggregator.getBufferSize()).toBeLessThan(5);
    });

    it('should handle large event payloads', () => {
      const largeData = { content: 'x'.repeat(10000) };
      aggregator.addEvent({ type: 'test', data: largeData });
      const batch = aggregator.flush();
      expect(batch?.events[0].data.content).toHaveLength(10000);
    });

    it('should handle events with no data', () => {
      aggregator.addEvent({ type: 'test', data: null });
      const batch = aggregator.flush();
      expect(batch?.events[0].data).toBeNull();
    });

    it('should handle events with complex nested data', () => {
      const complexData = {
        level1: {
          level2: {
            level3: { value: 'deep' }
          }
        }
      };
      aggregator.addEvent({ type: 'test', data: complexData });
      const batch = aggregator.flush();
      expect(batch?.events[0].data.level1.level2.level3.value).toBe('deep');
    });
  });

  describe('Performance', () => {
    it('should handle high event throughput', () => {
      const start = Date.now();
      for (let i = 0; i < 1000; i++) {
        aggregator.addEvent({ type: 'test', data: { index: i } });
      }
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(100);
    });

    it('should batch efficiently', () => {
      const batchAggregator = new MockEventAggregator(100, 1000);
      for (let i = 0; i < 100; i++) {
        batchAggregator.addEvent({ type: 'test', data: {} });
      }
      expect(batchAggregator.getBufferSize()).toBe(0);
    });
  });
});

describe('EventAggregator Integration', () => {
  it('should handle mixed event types', () => {
    const aggregator = new MockEventAggregator(10, 1000);
    
    aggregator.addEvent({ type: 'click', data: { target: 'button1' } });
    aggregator.addEvent({ type: 'scroll', data: { position: 100 } });
    aggregator.addEvent({ type: 'click', data: { target: 'button2' } });
    aggregator.addEvent({ type: 'input', data: { field: 'username' } });

    const batch = aggregator.flush();
    expect(batch?.count).toBe(4);

    const byType = aggregator.aggregateByType(batch!.events);
    expect(byType.get('click')).toHaveLength(2);
    expect(byType.get('scroll')).toHaveLength(1);
    expect(byType.get('input')).toHaveLength(1);
  });

  it('should handle continuous event stream', (done) => {
    const aggregator = new MockEventAggregator(5, 200);
    let batchCount = 0;

    aggregator.startAutoFlush((batch) => {
      batchCount++;
      expect(batch.count).toBeGreaterThan(0);
    });

    const interval = setInterval(() => {
      aggregator.addEvent({ type: 'stream', data: {} });
    }, 50);

    setTimeout(() => {
      clearInterval(interval);
      aggregator.stopAutoFlush();
      expect(batchCount).toBeGreaterThan(0);
      done();
    }, 600);
  });
});