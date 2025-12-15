/**
 * Test Mocks
 * 
 * Mock objects and functions for testing
 */

import { jest } from '@jest/globals';

/**
 * Mock PostgreSQL Pool
 */
export function createMockPool() {
  return {
    query: jest.fn<any>(),
    connect: jest.fn(),
    end: jest.fn(),
    on: jest.fn(),
    removeListener: jest.fn(),
  };
}

/**
 * Mock PostgreSQL Client
 */
export function createMockClient() {
  return {
    query: jest.fn(),
    release: jest.fn(),
    on: jest.fn(),
  };
}

/**
 * Mock Redis Client
 */
export function createMockRedis() {
  const store = new Map<string, any>();
  const hashes = new Map<string, Map<string, any>>();
  const sortedSets = new Map<string, Map<string, number>>();
  const expiries = new Map<string, number>();
  
  return {
    get: jest.fn(async (key: string) => store.get(key) || null),
    set: jest.fn(async (key: string, value: any) => {
      store.set(key, value);
      return 'OK';
    }),
    setex: jest.fn(async (key: string, seconds: number, value: any) => {
      store.set(key, value);
      expiries.set(key, Date.now() + seconds * 1000);
      return 'OK';
    }),
    del: jest.fn(async (...keys: string[]) => {
      let count = 0;
      keys.forEach(key => {
        if (store.delete(key)) count++;
        if (sortedSets.delete(key)) count++;
      });
      return count;
    }),
    zadd: jest.fn(async (key: string, score: number, member: string) => {
      if (!sortedSets.has(key)) {
        sortedSets.set(key, new Map());
      }
      sortedSets.get(key)!.set(member, score);
      return 1;
    }),
    zrange: jest.fn(async (key: string, start: number, stop: number) => {
      const set = sortedSets.get(key);
      if (!set) return [];
      return Array.from(set.keys());
    }),
    zrem: jest.fn(async (key: string, ...members: string[]) => {
      const set = sortedSets.get(key);
      if (!set) return 0;
      let count = 0;
      members.forEach(member => {
        if (set.delete(member)) count++;
      });
      return count;
    }),
    publish: jest.fn(async (channel: string, message: string) => {
      return 1;
    }),
    subscribe: jest.fn(async (channel: string, callback: Function) => {
      return undefined;
    }),
    unsubscribe: jest.fn(async (channel: string) => {
      return undefined;
    }),
    hset: jest.fn(async (key: string, field: string, value: any) => {
      if (!hashes.has(key)) {
        hashes.set(key, new Map());
      }
      hashes.get(key)!.set(field, value);
      return 1;
    }),
    hget: jest.fn(async (key: string, field: string) => {
      return hashes.get(key)?.get(field) || null;
    }),
    hgetall: jest.fn(async (key: string) => {
      const hash = hashes.get(key);
      if (!hash) return {};
      return Object.fromEntries(hash);
    }),
    hdel: jest.fn(async (key: string, ...fields: string[]) => {
      const hash = hashes.get(key);
      if (!hash) return 0;
      let count = 0;
      fields.forEach(field => {
        if (hash.delete(field)) count++;
      });
      return count;
    }),
    keys: jest.fn(async (pattern: string) => {
      const regex = new RegExp(pattern.replace('*', '.*'));
      return Array.from(store.keys()).filter(key => regex.test(key));
    }),
    expire: jest.fn(async (key: string, seconds: number) => {
      if (!store.has(key)) return 0;
      expiries.set(key, Date.now() + seconds * 1000);
      return 1;
    }),
    ttl: jest.fn(async (key: string) => {
      const expiry = expiries.get(key);
      if (!expiry) return -1;
      const remaining = Math.ceil((expiry - Date.now()) / 1000);
      return remaining > 0 ? remaining : -2;
    }),
    ping: jest.fn(async () => 'PONG'),
    flushdb: jest.fn(async () => {
      store.clear();
      hashes.clear();
      expiries.clear();
      return 'OK';
    }),
    quit: jest.fn(async () => 'OK'),
    on: jest.fn(),
    isReady: jest.fn(() => true),
    close: jest.fn(async () => undefined),
    
    // Expose internal store for testing
    _store: store,
    _hashes: hashes,
    _sortedSets: sortedSets,
    _expiries: expiries,
  };
}

/**
 * Mock WebSocket
 */
export function createMockWebSocket() {
  const listeners = new Map<string, Function[]>();
  
  return {
    send: jest.fn(),
    close: jest.fn(),
    on: jest.fn((event: string, handler: Function) => {
      if (!listeners.has(event)) {
        listeners.set(event, []);
      }
      listeners.get(event)!.push(handler);
    }),
    once: jest.fn(),
    off: jest.fn(),
    emit: jest.fn((event: string, ...args: any[]) => {
      listeners.get(event)?.forEach(handler => handler(...args));
    }),
    readyState: 1, // OPEN
    
    // Expose internal state for testing
    _listeners: listeners,
  };
}

/**
 * Mock WebSocket Server
 */
export function createMockWebSocketServer() {
  const clients = new Set();
  
  return {
    on: jest.fn(),
    clients,
    close: jest.fn(),
    emit: jest.fn(),
  };
}

/**
 * Mock Request object
 */
export function createMockRequest(overrides: any = {}) {
  return {
    headers: {},
    params: {},
    query: {},
    body: {},
    method: 'GET',
    url: '/',
    ...overrides,
  };
}

/**
 * Mock Response object
 */
export function createMockResponse() {
  const res: any = {
    status: jest.fn(() => res),
    json: jest.fn(() => res),
    send: jest.fn(() => res),
    setHeader: jest.fn(() => res),
    end: jest.fn(() => res),
  };
  return res;
}

/**
 * Mock Next function
 */
export function createMockNext() {
  return jest.fn();
}

/**
 * Mock Logger
 */
export function createMockLogger() {
  return {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    log: jest.fn(),
  };
}

/**
 * Mock File System
 */
export function createMockFs() {
  const files = new Map<string, string>();
  
  return {
    readFile: jest.fn(async (path: string) => files.get(path) || ''),
    writeFile: jest.fn(async (path: string, content: string) => {
      files.set(path, content);
    }),
    unlink: jest.fn(async (path: string) => {
      files.delete(path);
    }),
    exists: jest.fn(async (path: string) => files.has(path)),
    
    // Expose internal state
    _files: files,
  };
}

/**
 * Create a spy that tracks all calls with arguments
 */
export function createSpy<T extends (...args: any[]) => any>(
  implementation?: T
): jest.Mock<T> {
  return jest.fn(implementation) as jest.Mock<T>;
}

/**
 * Wait for a condition to be true
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeout = 5000,
  interval = 50
): Promise<void> {
  const start = Date.now();
  
  while (true) {
    if (await condition()) {
      return;
    }
    
    if (Date.now() - start > timeout) {
      throw new Error('Timeout waiting for condition');
    }
    
    await new Promise(resolve => setTimeout(resolve, interval));
  }
}

/**
 * Advance timers by specified milliseconds
 */
export function advanceTime(ms: number): void {
  jest.advanceTimersByTime(ms);
}

/**
 * Reset all mocks
 */
export function resetAllMocks(): void {
  jest.resetAllMocks();
}

/**
 * Clear all mocks
 */
export function clearAllMocks(): void {
  jest.clearAllMocks();
}