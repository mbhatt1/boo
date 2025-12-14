/**
 * Test Helper Utilities
 * 
 * Common utility functions for tests
 */

import { randomBytes } from 'crypto';

/**
 * Sleep for specified milliseconds
 */
export const sleep = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Generate a random UUID v4
 */
export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Generate a random string of specified length
 */
export function generateRandomString(length: number): string {
  return randomBytes(Math.ceil(length / 2))
    .toString('hex')
    .slice(0, length);
}

/**
 * Generate a random email
 */
export function generateEmail(): string {
  return `test_${generateRandomString(8)}@example.com`;
}

/**
 * Generate a random username
 */
export function generateUsername(): string {
  return `test_user_${generateRandomString(8)}`;
}

/**
 * Generate a random session ID
 */
export function generateSessionId(): string {
  return `session_${generateRandomString(12)}`;
}

/**
 * Generate a random paper ID
 */
export function generatePaperId(): string {
  return `paper_${generateRandomString(10)}`;
}

/**
 * Create a timestamp N seconds from now
 */
export function timestampFromNow(seconds: number): Date {
  return new Date(Date.now() + seconds * 1000);
}

/**
 * Create a timestamp N seconds ago
 */
export function timestampAgo(seconds: number): Date {
  return new Date(Date.now() - seconds * 1000);
}

/**
 * Wait for a condition to be true
 */
export async function waitForCondition(
  condition: () => boolean | Promise<boolean>,
  options: {
    timeout?: number;
    interval?: number;
    message?: string;
  } = {}
): Promise<void> {
  const {
    timeout = 5000,
    interval = 50,
    message = 'Condition not met within timeout'
  } = options;
  
  const start = Date.now();
  
  while (true) {
    try {
      if (await condition()) {
        return;
      }
    } catch (error) {
      // Continue waiting on error
    }
    
    if (Date.now() - start > timeout) {
      throw new Error(message);
    }
    
    await sleep(interval);
  }
}

/**
 * Retry an async operation
 */
export async function retry<T>(
  operation: () => Promise<T>,
  options: {
    retries?: number;
    delay?: number;
    onRetry?: (attempt: number, error: any) => void;
  } = {}
): Promise<T> {
  const { retries = 3, delay = 100, onRetry } = options;
  
  let lastError: any;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      if (onRetry) {
        onRetry(attempt, error);
      }
      
      if (attempt < retries) {
        await sleep(delay * attempt);
      }
    }
  }
  
  throw lastError;
}

/**
 * Create a deferred promise
 */
export function defer<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: any) => void;
  
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  
  return { promise, resolve, reject };
}

/**
 * Measure execution time of an async function
 */
export async function measureTime<T>(
  fn: () => Promise<T>
): Promise<{ result: T; duration: number }> {
  const start = Date.now();
  const result = await fn();
  const duration = Date.now() - start;
  
  return { result, duration };
}

/**
 * Create a throttled function
 */
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): T {
  let lastCall = 0;
  
  return ((...args: any[]) => {
    const now = Date.now();
    
    if (now - lastCall < delay) {
      return;
    }
    
    lastCall = now;
    return fn(...args);
  }) as T;
}

/**
 * Create a debounced function
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): T {
  let timeoutId: NodeJS.Timeout | null = null;
  
  return ((...args: any[]) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
    timeoutId = setTimeout(() => {
      fn(...args);
      timeoutId = null;
    }, delay);
  }) as T;
}

/**
 * Deep clone an object
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Compare two objects deeply
 */
export function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;
  
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    return false;
  }
  
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  
  if (keysA.length !== keysB.length) {
    return false;
  }
  
  for (const key of keysA) {
    if (!keysB.includes(key) || !deepEqual(a[key], b[key])) {
      return false;
    }
  }
  
  return true;
}

/**
 * Assert that a promise rejects with a specific error
 */
export async function assertRejects(
  promise: Promise<any>,
  expectedError?: string | RegExp | ((error: any) => boolean)
): Promise<void> {
  try {
    await promise;
    throw new Error('Expected promise to reject, but it resolved');
  } catch (error: any) {
    if (!expectedError) {
      return; // Just check that it rejected
    }
    
    if (typeof expectedError === 'string') {
      if (!error.message.includes(expectedError)) {
        throw new Error(`Expected error message to include "${expectedError}", got "${error.message}"`);
      }
    } else if (expectedError instanceof RegExp) {
      if (!expectedError.test(error.message)) {
        throw new Error(`Expected error message to match ${expectedError}, got "${error.message}"`);
      }
    } else if (typeof expectedError === 'function') {
      if (!expectedError(error)) {
        throw new Error('Error did not match expected condition');
      }
    }
  }
}

/**
 * Create a mock timer
 */
export class MockTimer {
  private time = 0;
  private timers: Array<{ callback: () => void; time: number }> = [];
  
  setTimeout(callback: () => void, delay: number): void {
    this.timers.push({ callback, time: this.time + delay });
  }
  
  tick(ms: number): void {
    this.time += ms;
    
    const ready = this.timers.filter(t => t.time <= this.time);
    this.timers = this.timers.filter(t => t.time > this.time);
    
    ready.forEach(t => t.callback());
  }
  
  clear(): void {
    this.timers = [];
    this.time = 0;
  }
}

/**
 * Capture console output
 */
export class ConsoleCapture {
  private originalLog: any;
  private originalError: any;
  private originalWarn: any;
  private logs: string[] = [];
  private errors: string[] = [];
  private warnings: string[] = [];
  
  start(): void {
    this.originalLog = console.log;
    this.originalError = console.error;
    this.originalWarn = console.warn;
    
    console.log = (...args: any[]) => this.logs.push(args.join(' '));
    console.error = (...args: any[]) => this.errors.push(args.join(' '));
    console.warn = (...args: any[]) => this.warnings.push(args.join(' '));
  }
  
  stop(): void {
    console.log = this.originalLog;
    console.error = this.originalError;
    console.warn = this.originalWarn;
  }
  
  getLogs(): string[] {
    return [...this.logs];
  }
  
  getErrors(): string[] {
    return [...this.errors];
  }
  
  getWarnings(): string[] {
    return [...this.warnings];
  }
  
  clear(): void {
    this.logs = [];
    this.errors = [];
    this.warnings = [];
  }
}