/**
 * Event Deduplicator - Memory-efficient event deduplication using bloom filter
 * 
 * Prevents duplicate events from being processed or broadcast within a
 * configurable time window. Uses a space-efficient bloom filter with
 * time-based expiration.
 */

/**
 * Simple bloom filter implementation for event deduplication
 * 
 * Uses multiple hash functions to minimize false positives while
 * maintaining memory efficiency. Automatically expires old entries
 * based on configured TTL.
 */
class BloomFilter {
  private bitArray: Uint8Array;
  private size: number;
  private hashCount: number;
  private timestamps: Map<number, number>;
  
  /**
   * Create a new bloom filter
   * 
   * @param expectedElements Expected number of elements
   * @param falsePositiveRate Desired false positive rate (0.0-1.0)
   */
  constructor(expectedElements: number = 10000, falsePositiveRate: number = 0.01) {
    // Calculate optimal size and hash count
    this.size = Math.ceil(
      -(expectedElements * Math.log(falsePositiveRate)) / (Math.log(2) ** 2)
    );
    this.hashCount = Math.ceil((this.size / expectedElements) * Math.log(2));
    
    // Allocate bit array (1 byte = 8 bits)
    const byteSize = Math.ceil(this.size / 8);
    this.bitArray = new Uint8Array(byteSize);
    
    // Track insertion timestamps for expiration
    this.timestamps = new Map();
  }
  
  /**
   * Add an element to the filter
   * 
   * @param element Element to add
   * @param timestamp Timestamp of insertion (ms)
   */
  add(element: string, timestamp: number): void {
    const hashes = this.getHashes(element);
    for (const hash of hashes) {
      const bitIndex = hash % this.size;
      const byteIndex = Math.floor(bitIndex / 8);
      const bitOffset = bitIndex % 8;
      this.bitArray[byteIndex] |= (1 << bitOffset);
      this.timestamps.set(hash, timestamp);
    }
  }
  
  /**
   * Check if an element might be in the filter
   * 
   * @param element Element to check
   * @returns true if element might be in filter (can have false positives)
   */
  contains(element: string): boolean {
    const hashes = this.getHashes(element);
    for (const hash of hashes) {
      const bitIndex = hash % this.size;
      const byteIndex = Math.floor(bitIndex / 8);
      const bitOffset = bitIndex % 8;
      if ((this.bitArray[byteIndex] & (1 << bitOffset)) === 0) {
        return false;
      }
    }
    return true;
  }
  
  /**
   * Clear the filter
   */
  clear(): void {
    this.bitArray.fill(0);
    this.timestamps.clear();
  }
  
  /**
   * Remove expired entries
   * 
   * @param expirationTime Timestamp before which entries should be removed
   */
  removeExpired(expirationTime: number): void {
    // Remove timestamp entries older than expiration time
    for (const [hash, timestamp] of this.timestamps.entries()) {
      if (timestamp < expirationTime) {
        this.timestamps.delete(hash);
      }
    }
    
    // If too many entries have expired, rebuild the filter
    if (this.timestamps.size < this.size * 0.1) {
      this.rebuild();
    }
  }
  
  /**
   * Rebuild the filter from remaining timestamps
   */
  private rebuild(): void {
    this.bitArray.fill(0);
    // Filter is rebuilt on next add operations
  }
  
  /**
   * Generate multiple hash values for an element
   * 
   * Uses double hashing technique for efficiency
   * 
   * @param element Element to hash
   * @returns Array of hash values
   */
  private getHashes(element: string): number[] {
    const hash1 = this.simpleHash(element, 0);
    const hash2 = this.simpleHash(element, 1);
    
    const hashes: number[] = [];
    for (let i = 0; i < this.hashCount; i++) {
      hashes.push(Math.abs(hash1 + i * hash2));
    }
    return hashes;
  }
  
  /**
   * Simple string hash function
   * 
   * @param str String to hash
   * @param seed Hash seed
   * @returns Hash value
   */
  private simpleHash(str: string, seed: number): number {
    let hash = seed;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }
}

/**
 * Configuration for event deduplicator
 */
export interface EventDeduplicatorConfig {
  /**
   * Time window in milliseconds for deduplication
   * Events with the same ID within this window are considered duplicates
   */
  windowMs: number;
  
  /**
   * Expected number of events for bloom filter sizing
   */
  expectedEvents?: number;
  
  /**
   * Desired false positive rate (0.0-1.0)
   */
  falsePositiveRate?: number;
  
  /**
   * Cleanup interval in milliseconds
   */
  cleanupIntervalMs?: number;
}

/**
 * Event deduplicator for preventing duplicate event processing
 * 
 * Uses a bloom filter for memory-efficient deduplication with automatic
 * expiration of old entries. Thread-safe for concurrent access.
 */
export class EventDeduplicator {
  private filter: BloomFilter;
  private config: Required<EventDeduplicatorConfig>;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private recentEvents: Map<string, number>; // Fallback for accuracy
  
  /**
   * Create a new event deduplicator
   * 
   * @param config Deduplicator configuration
   */
  constructor(config: EventDeduplicatorConfig) {
    this.config = {
      windowMs: config.windowMs,
      expectedEvents: config.expectedEvents || 10000,
      falsePositiveRate: config.falsePositiveRate || 0.01,
      cleanupIntervalMs: config.cleanupIntervalMs || 60000,
    };
    
    this.filter = new BloomFilter(
      this.config.expectedEvents,
      this.config.falsePositiveRate
    );
    
    // Maintain a small set of recent events for accuracy
    this.recentEvents = new Map();
    
    // Start periodic cleanup
    this.startCleanup();
  }
  
  /**
   * Check if an event is a duplicate
   * 
   * @param eventId Unique event identifier
   * @returns true if event is a duplicate
   */
  isDuplicate(eventId: string): boolean {
    const now = Date.now();
    
    // Check recent events map for accuracy
    const recentTimestamp = this.recentEvents.get(eventId);
    if (recentTimestamp && (now - recentTimestamp) < this.config.windowMs) {
      return true;
    }
    
    // Check bloom filter (may have false positives)
    if (this.filter.contains(eventId)) {
      // Verify with recent events map
      if (this.recentEvents.has(eventId)) {
        return true;
      }
      // False positive from bloom filter, but treat as new event
      this.markSeen(eventId);
      return false;
    }
    
    return false;
  }
  
  /**
   * Mark an event as seen
   * 
   * @param eventId Unique event identifier
   */
  markSeen(eventId: string): void {
    const now = Date.now();
    this.filter.add(eventId, now);
    this.recentEvents.set(eventId, now);
    
    // Limit size of recent events map
    if (this.recentEvents.size > this.config.expectedEvents * 0.1) {
      this.cleanupRecentEvents();
    }
  }
  
  /**
   * Check and mark an event in one operation
   * 
   * @param eventId Unique event identifier
   * @returns true if event is a duplicate
   */
  checkAndMark(eventId: string): boolean {
    if (this.isDuplicate(eventId)) {
      return true;
    }
    this.markSeen(eventId);
    return false;
  }
  
  /**
   * Clear all tracked events
   */
  clear(): void {
    this.filter.clear();
    this.recentEvents.clear();
  }
  
  /**
   * Get statistics about the deduplicator
   * 
   * @returns Deduplicator statistics
   */
  getStats(): {
    recentEventsCount: number;
    windowMs: number;
    expectedEvents: number;
    falsePositiveRate: number;
  } {
    return {
      recentEventsCount: this.recentEvents.size,
      windowMs: this.config.windowMs,
      expectedEvents: this.config.expectedEvents,
      falsePositiveRate: this.config.falsePositiveRate,
    };
  }
  
  /**
   * Destroy the deduplicator and cleanup resources
   */
  destroy(): void {
    this.stopCleanup();
    this.clear();
  }
  
  /**
   * Start periodic cleanup of expired entries
   */
  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupIntervalMs);
  }
  
  /**
   * Stop periodic cleanup
   */
  private stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
  
  /**
   * Remove expired entries from tracking
   */
  private cleanup(): void {
    const now = Date.now();
    const expirationTime = now - this.config.windowMs;
    
    // Clean up bloom filter
    this.filter.removeExpired(expirationTime);
    
    // Clean up recent events map
    this.cleanupRecentEvents();
  }
  
  /**
   * Remove expired entries from recent events map
   */
  private cleanupRecentEvents(): void {
    const now = Date.now();
    const expirationTime = now - this.config.windowMs;
    
    for (const [eventId, timestamp] of this.recentEvents.entries()) {
      if (timestamp < expirationTime) {
        this.recentEvents.delete(eventId);
      }
    }
  }
}

/**
 * Create a new event deduplicator with default configuration
 * 
 * @param windowMs Deduplication window in milliseconds
 * @returns New EventDeduplicator instance
 */
export function createDeduplicator(windowMs: number = 5000): EventDeduplicator {
  return new EventDeduplicator({ windowMs });
}

export default EventDeduplicator;