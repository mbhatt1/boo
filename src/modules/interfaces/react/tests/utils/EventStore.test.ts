/**
 * Comprehensive unit tests for EventStore utility
 * Testing event storage, retrieval, filtering, and management
 */

import { EventStore } from '../../src/utils/EventStore';

interface TestEvent {
  id: string;
  type: string;
  data: any;
  timestamp: number;
}

describe('EventStore', () => {
  let store: EventStore<TestEvent>;

  beforeEach(() => {
    store = new EventStore<TestEvent>(100);
  });

  describe('Basic Operations', () => {
    test('should initialize with correct capacity', () => {
      const customStore = new EventStore<TestEvent>(50);
      expect(customStore).toBeDefined();
    });

    test('should add single event', () => {
      const event: TestEvent = {
        id: '1',
        type: 'test',
        data: { value: 'test' },
        timestamp: Date.now()
      };
      store.add(event);
      const events = store.getAll();
      expect(events).toContain(event);
    });

    test('should add multiple events', () => {
      const events: TestEvent[] = [
        { id: '1', type: 'test1', data: {}, timestamp: Date.now() },
        { id: '2', type: 'test2', data: {}, timestamp: Date.now() },
        { id: '3', type: 'test3', data: {}, timestamp: Date.now() }
      ];
      events.forEach(e => store.add(e));
      expect(store.getAll().length).toBe(3);
    });
  });

  describe('Retrieval Operations', () => {
    test('should get all events', () => {
      const event1: TestEvent = { id: '1', type: 'test', data: {}, timestamp: Date.now() };
      const event2: TestEvent = { id: '2', type: 'test', data: {}, timestamp: Date.now() };
      store.add(event1);
      store.add(event2);
      const all = store.getAll();
      expect(all.length).toBe(2);
    });

    test('should get events by type', () => {
      store.add({ id: '1', type: 'typeA', data: {}, timestamp: Date.now() });
      store.add({ id: '2', type: 'typeB', data: {}, timestamp: Date.now() });
      store.add({ id: '3', type: 'typeA', data: {}, timestamp: Date.now() });
      
      const typeAEvents = store.getByType('typeA');
      expect(typeAEvents.length).toBe(2);
    });

    test('should get event by id', () => {
      const event: TestEvent = { id: 'unique-id', type: 'test', data: {}, timestamp: Date.now() };
      store.add(event);
      const found = store.getById('unique-id');
      expect(found).toEqual(event);
    });

    test('should return undefined for non-existent id', () => {
      const found = store.getById('non-existent');
      expect(found).toBeUndefined();
    });
  });

  describe('Filtering Operations', () => {
    test('should filter events by predicate', () => {
      store.add({ id: '1', type: 'test', data: { value: 10 }, timestamp: Date.now() });
      store.add({ id: '2', type: 'test', data: { value: 20 }, timestamp: Date.now() });
      store.add({ id: '3', type: 'test', data: { value: 30 }, timestamp: Date.now() });
      
      const filtered = store.filter(e => e.data.value > 15);
      expect(filtered.length).toBe(2);
    });

    test('should filter by timestamp range', () => {
      const now = Date.now();
      store.add({ id: '1', type: 'test', data: {}, timestamp: now - 1000 });
      store.add({ id: '2', type: 'test', data: {}, timestamp: now });
      store.add({ id: '3', type: 'test', data: {}, timestamp: now + 1000 });
      
      const recent = store.filter(e => e.timestamp >= now);
      expect(recent.length).toBe(2);
    });
  });

  describe('Capacity Management', () => {
    test('should respect capacity limits', () => {
      const smallStore = new EventStore<TestEvent>(3);
      for (let i = 0; i < 5; i++) {
        smallStore.add({ id: `${i}`, type: 'test', data: {}, timestamp: Date.now() });
      }
      expect(smallStore.getAll().length).toBeLessThanOrEqual(3);
    });

    test('should remove oldest events when capacity exceeded', () => {
      const smallStore = new EventStore<TestEvent>(2);
      smallStore.add({ id: '1', type: 'test', data: {}, timestamp: Date.now() });
      smallStore.add({ id: '2', type: 'test', data: {}, timestamp: Date.now() });
      smallStore.add({ id: '3', type: 'test', data: {}, timestamp: Date.now() });
      
      const event1 = smallStore.getById('1');
      expect(event1).toBeUndefined();
    });
  });

  describe('Clear Operations', () => {
    test('should clear all events', () => {
      store.add({ id: '1', type: 'test', data: {}, timestamp: Date.now() });
      store.add({ id: '2', type: 'test', data: {}, timestamp: Date.now() });
      store.clear();
      expect(store.getAll().length).toBe(0);
    });

    test('should allow adding after clear', () => {
      store.add({ id: '1', type: 'test', data: {}, timestamp: Date.now() });
      store.clear();
      store.add({ id: '2', type: 'test', data: {}, timestamp: Date.now() });
      expect(store.getAll().length).toBe(1);
    });
  });

  describe('Edge Cases', () => {
    test('should handle duplicate ids', () => {
      const event1: TestEvent = { id: 'same-id', type: 'test1', data: {}, timestamp: Date.now() };
      const event2: TestEvent = { id: 'same-id', type: 'test2', data: {}, timestamp: Date.now() };
      store.add(event1);
      store.add(event2);
      const found = store.getById('same-id');
      expect(found?.type).toBe('test2'); // Should get the latest one
    });

    test('should handle empty event data', () => {
      const event: TestEvent = { id: '1', type: 'test', data: null, timestamp: Date.now() };
      store.add(event);
      expect(store.getAll().length).toBe(1);
    });

    test('should handle events with complex data', () => {
      const event: TestEvent = {
        id: '1',
        type: 'complex',
        data: {
          nested: {
            deep: {
              value: 'test'
            },
            array: [1, 2, 3]
          }
        },
        timestamp: Date.now()
      };
      store.add(event);
      const found = store.getById('1');
      expect(found?.data.nested.deep.value).toBe('test');
    });

    test('should handle rapid additions', () => {
      for (let i = 0; i < 1000; i++) {
        store.add({ id: `${i}`, type: 'test', data: {}, timestamp: Date.now() });
      }
      expect(store.getAll().length).toBeLessThanOrEqual(100);
    });
  });

  describe('Statistics and Queries', () => {
    test('should count events by type', () => {
      store.add({ id: '1', type: 'typeA', data: {}, timestamp: Date.now() });
      store.add({ id: '2', type: 'typeA', data: {}, timestamp: Date.now() });
      store.add({ id: '3', type: 'typeB', data: {}, timestamp: Date.now() });
      
      const typeACount = store.getByType('typeA').length;
      expect(typeACount).toBe(2);
    });

    test('should get latest event', () => {
      const older: TestEvent = { id: '1', type: 'test', data: {}, timestamp: Date.now() - 1000 };
      const newer: TestEvent = { id: '2', type: 'test', data: {}, timestamp: Date.now() };
      store.add(older);
      store.add(newer);
      
      const all = store.getAll();
      const latest = all[all.length - 1];
      expect(latest.id).toBe('2');
    });
  });
});