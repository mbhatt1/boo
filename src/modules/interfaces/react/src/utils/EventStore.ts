/**
 * Optimized Event Store for High-Performance Event Streaming
 * 
 * Uses chunked arrays to avoid O(n) spreading operations.
 * Provides O(1) append and efficient iteration.
 */

import React from 'react';
import { DisplayStreamEvent } from '../components/StreamDisplay.js';

// Chunk size for internal storage - balance between memory and performance
const CHUNK_SIZE = 100;
const MAX_EVENTS = 10000; // Maximum events to keep in memory

/**
 * EventStore - Efficient append-only event storage
 *
 * Instead of [...prev, newEvent] which is O(n), this uses chunked arrays
 * for O(1) append operations and efficient memory usage.
 */
export class EventStore<T = DisplayStreamEvent> {
  private chunks: T[][] = [];
  private currentChunk: T[] = [];
  private totalCount = 0;
  private maxEvents: number;
  private eventMap: Map<string, T> = new Map(); // For quick ID lookup

  constructor(maxEvents = MAX_EVENTS) {
    this.maxEvents = maxEvents;
  }

  /**
   * Append a single event - O(1) operation
   */
  append(event: T): void {
    // Track by ID if event has one
    const eventWithId = event as any;
    if (eventWithId.id) {
      // If ID exists, update the existing event in the map (for getById to return latest)
      this.eventMap.set(eventWithId.id, event);
    }

    // Add to current chunk
    this.currentChunk.push(event);
    this.totalCount++;

    // Start new chunk if current is full
    if (this.currentChunk.length >= CHUNK_SIZE) {
      this.chunks.push(this.currentChunk);
      this.currentChunk = [];
    }
    
    // Trim after adding if over limit to maintain capacity
    if (this.totalCount > this.maxEvents) {
      this.trimToMaxSize();
    }
  }

  /**
   * Add a single event (alias for append for compatibility)
   */
  add(event: T): void {
    this.append(event);
  }

  /**
   * Append multiple events efficiently
   */
  appendBatch(events: T[]): void {
    for (const event of events) {
      this.append(event);
    }
  }

  /**
   * Get all events as array - only when needed for rendering
   */
  toArray(): T[] {
    // Only flatten when necessary
    const result: T[] = [];
    
    // Add completed chunks
    for (const chunk of this.chunks) {
      result.push(...chunk);
    }
    
    // Add current chunk
    result.push(...this.currentChunk);
    
    return result;
  }

  /**
   * Get all events (alias for toArray for compatibility)
   */
  getAll(): T[] {
    return this.toArray();
  }

  /**
   * Get event by id (if event has id property)
   */
  getById(id: string): T | undefined {
    return this.eventMap.get(id);
  }

  /**
   * Get events by type (if event has type property)
   */
  getByType(type: string): T[] {
    const result: T[] = [];
    for (const chunk of this.chunks) {
      result.push(...chunk.filter((event: any) => event.type === type));
    }
    result.push(...this.currentChunk.filter((event: any) => event.type === type));
    return result;
  }

  /**
   * Filter events by predicate
   */
  filter(predicate: (event: T) => boolean): T[] {
    const result: T[] = [];
    for (const chunk of this.chunks) {
      result.push(...chunk.filter(predicate));
    }
    result.push(...this.currentChunk.filter(predicate));
    return result;
  }

  /**
   * Get recent events without copying all data
   */
  getRecent(count: number): T[] {
    const total = this.totalCount;
    if (count >= total) {
      return this.toArray();
    }

    const result: T[] = [];
    const needed = Math.min(count, total);
    
    // Start from current chunk and work backwards
    let remaining = needed;
    
    // Take from current chunk first
    if (this.currentChunk.length > 0) {
      const fromCurrent = Math.min(remaining, this.currentChunk.length);
      const startIdx = Math.max(0, this.currentChunk.length - fromCurrent);
      result.unshift(...this.currentChunk.slice(startIdx));
      remaining -= fromCurrent;
    }
    
    // Take from previous chunks if needed
    for (let i = this.chunks.length - 1; i >= 0 && remaining > 0; i--) {
      const chunk = this.chunks[i];
      const fromChunk = Math.min(remaining, chunk.length);
      const startIdx = Math.max(0, chunk.length - fromChunk);
      result.unshift(...chunk.slice(startIdx));
      remaining -= fromChunk;
    }
    
    return result;
  }

  /**
   * Get events for a specific range (for virtualization)
   */
  getRange(start: number, end: number): T[] {
    const result: T[] = [];
    let currentIndex = 0;

    // Iterate through chunks efficiently
    for (const chunk of this.chunks) {
      const chunkEnd = currentIndex + chunk.length;
      
      if (chunkEnd > start && currentIndex < end) {
        const startInChunk = Math.max(0, start - currentIndex);
        const endInChunk = Math.min(chunk.length, end - currentIndex);
        result.push(...chunk.slice(startInChunk, endInChunk));
      }
      
      currentIndex = chunkEnd;
      if (currentIndex >= end) break;
    }

    // Check current chunk if needed
    if (currentIndex < end) {
      const startInChunk = Math.max(0, start - currentIndex);
      const endInChunk = Math.min(this.currentChunk.length, end - currentIndex);
      if (startInChunk < endInChunk) {
        result.push(...this.currentChunk.slice(startInChunk, endInChunk));
      }
    }

    return result;
  }

  /**
   * Clear all events
   */
  clear(): void {
    this.chunks = [];
    this.currentChunk = [];
    this.totalCount = 0;
  }

  /**
   * Get total event count
   */
  get count(): number {
    return this.totalCount;
  }

  /**
   * Trim old events to stay at or under max size
   */
  private trimToMaxSize(): void {
    while (this.totalCount > this.maxEvents) {
      // Remove oldest event (from first chunk or current chunk if no chunks)
      if (this.chunks.length > 0) {
        const oldestChunk = this.chunks[0];
        const removedEvent = oldestChunk.shift();
        
        if (removedEvent) {
          // Clean up eventMap for removed event
          const eventWithId = removedEvent as any;
          if (eventWithId.id) {
            this.eventMap.delete(eventWithId.id);
          }
          this.totalCount--;
        }
        
        // Remove empty chunk
        if (oldestChunk.length === 0) {
          this.chunks.shift();
        }
      } else if (this.currentChunk.length > 0) {
        // No complete chunks, remove from current chunk
        const removedEvent = this.currentChunk.shift();
        
        if (removedEvent) {
          // Clean up eventMap for removed event
          const eventWithId = removedEvent as any;
          if (eventWithId.id) {
            this.eventMap.delete(eventWithId.id);
          }
          this.totalCount--;
        }
      } else {
        // Safety break - should never happen
        break;
      }
    }
  }

  /**
   * Create a snapshot for immutable rendering
   */
  snapshot(): ReadonlyArray<T> {
    return Object.freeze(this.toArray());
  }

  /**
   * Split into completed and active events
   */
  split(activeCount: number): {
    completed: T[];
    active: T[];
  } {
    const total = this.totalCount;
    
    if (activeCount >= total) {
      return {
        completed: [],
        active: this.toArray()
      };
    }

    const completedCount = total - activeCount;
    
    return {
      completed: this.getRange(0, completedCount),
      active: this.getRange(completedCount, total)
    };
  }
}

/**
 * React Hook for using EventStore
 */
export function useEventStore(maxEvents = MAX_EVENTS) {
  const storeRef = React.useRef(new EventStore<DisplayStreamEvent>(maxEvents));
  const [version, setVersion] = React.useState(0);

  // Stable callbacks without version dependency
  const append = React.useCallback((event: DisplayStreamEvent) => {
    storeRef.current.append(event);
    setVersion(v => v + 1);
  }, []); // No dependencies - stable reference

  const appendBatch = React.useCallback((events: DisplayStreamEvent[]) => {
    storeRef.current.appendBatch(events);
    setVersion(v => v + 1);
  }, []);

  const clear = React.useCallback(() => {
    storeRef.current.clear();
    setVersion(v => v + 1);
  }, []);

  // Use version only for derived data that needs re-render
  const getEvents = React.useMemo(() => {
    return storeRef.current.toArray();
  }, [version]);

  const getRecent = React.useCallback((count: number) => {
    // Direct access without version dependency
    return storeRef.current.getRecent(count);
  }, []);

  const split = React.useCallback((activeCount: number) => {
    return storeRef.current.split(activeCount);
  }, []);

  return React.useMemo(() => ({
    append,
    appendBatch,
    clear,
    getEvents,
    getRecent,
    split,
    count: storeRef.current.count
  }), [append, appendBatch, clear, getEvents, getRecent, split]);
}