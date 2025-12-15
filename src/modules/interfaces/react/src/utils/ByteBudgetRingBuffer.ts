export class ByteBudgetRingBuffer<T> {
  private items: Array<{item: T, size: number}> = [];
  private byteLimit: number;
  private currentBytes = 0;
  private estimator: (item: T) => number;
  private overflowReducer?: (item: T) => T;

  constructor(
    byteLimit: number,
    estimatorOrOptions?:
      | ((item: T) => number)
      | { estimator?: (item: T) => number; overflowReducer?: (item: T) => T }
  ) {
    if (byteLimit <= 0 || !Number.isFinite(byteLimit)) {
      throw new Error('ByteBudgetRingBuffer capacity must be > 0');
    }
    this.byteLimit = Math.max(1, byteLimit | 0);
    const defaultEstimator = (item: any) => {
      // Estimate byte size more accurately
      try {
        if (item == null) return 0;
        
        // For strings, use length directly (UTF-8 encoding ~= char count for ASCII)
        if (typeof item === 'string') {
          return Math.max(1, item.length);
        }
        
        // For objects, recursively estimate size
        if (typeof item === 'object') {
          let bytes = 16; // minimal object overhead
          
          // Helper to add string length
          const addStr = (v: any) => {
            if (typeof v === 'string') {
              bytes += v.length;
            }
          };
          
          // Helper to recursively count nested objects
          const addNested = (v: any) => {
            if (typeof v === 'string') {
              bytes += v.length;
            } else if (typeof v === 'object' && v !== null) {
              // Recursively estimate nested object size
              try {
                const jsonStr = JSON.stringify(v);
                bytes += jsonStr.length;
              } catch {
                bytes += 64; // fallback for circular refs
              }
            } else if (v != null) {
              bytes += 8; // primitive overhead
            }
          };
          
          // Check common field names
          const s = item as any;
          addStr(s.content);
          addStr(s.command);
          addStr(s.message);
          addStr(s.tool_name);
          addStr(s.tool);
          addStr(s.data);
          addStr(s.id);
          addStr(s.name);
          
          // Check for nested objects
          if (s.nested && typeof s.nested === 'object') {
            addNested(s.nested);
          }
          
          // If we haven't counted much, do a full JSON estimate
          if (bytes < 32) {
            try {
              const jsonStr = JSON.stringify(item);
              bytes = Math.max(bytes, jsonStr.length);
            } catch {
              bytes = 64;
            }
          }
          
          return Math.max(16, bytes);
        }
        
        // Primitives
        return 8;
      } catch {
        return 64;
      }
    };

    if (typeof estimatorOrOptions === 'function') {
      this.estimator = estimatorOrOptions;
    } else if (estimatorOrOptions && typeof estimatorOrOptions === 'object') {
      this.estimator = estimatorOrOptions.estimator || defaultEstimator;
      this.overflowReducer = estimatorOrOptions.overflowReducer;
    } else {
      this.estimator = defaultEstimator;
    }
  }

  get capacity(): number {
    return this.byteLimit;
  }

  get size(): number {
    return this.items.length;
  }

  get currentByteSize(): number {
    return this.currentBytes;
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }

  clear() {
    this.items = [];
    this.currentBytes = 0;
  }

  push(item: T) {
    let toStore = item;
    let size = this.estimator(toStore);

    // If a single item exceeds the budget, attempt to reduce it.
    if (size > this.byteLimit && this.overflowReducer) {
      try {
        toStore = this.overflowReducer(toStore);
        size = this.estimator(toStore);
      } catch {
        // If reducer fails, skip storing this item entirely
        return;
      }
    }

    // If still over budget, skip storing to preserve memory bounds
    if (size > this.byteLimit) {
      return;
    }

    // Store item with its size (Bug #111 fix - prevents estimator inconsistency)
    this.items.push({item: toStore, size});
    
    // Check for integer overflow before adding (Bug #110 fix)
    if (this.currentBytes > Number.MAX_SAFE_INTEGER - size) {
      console.warn('ByteBudgetRingBuffer: Integer overflow detected, recalculating bytes');
      this.recalculateBytes();
      // Bug #14 Fix: Verify recalculation succeeded
      if (this.currentBytes > Number.MAX_SAFE_INTEGER - size) {
        console.error('ByteBudgetRingBuffer: Overflow persists after recalculation, clearing buffer');
        this.clear();
        return;
      }
    } else {
      this.currentBytes += size;
    }
    
    this.enforceBudget();
  }

  pushMany(items: T[]) {
    for (const it of items) {
      this.push(it);
    }
  }

  private enforceBudget() {
    // Remove from the front until under budget
    if (this.currentBytes <= this.byteLimit) return;
    // Remove 10% headroom in one go to reduce churn
    const target = Math.floor(this.byteLimit * 0.9);
    while (this.items.length > 0 && this.currentBytes > target) {
      const {item, size} = this.items.shift()!;
      this.currentBytes -= size;  // Use stored size, not re-estimated (Bug #111 fix)
      
      // Safety check: prevent negative bytes (Bug #111 fix)
      if (this.currentBytes < 0) {
        console.warn('ByteBudgetRingBuffer: currentBytes went negative, recalculating');
        this.recalculateBytes();
        break;
      }
    }
  }

  /**
   * Recalculate total bytes from stored sizes (Bug #110 & #111 fix)
   * Used as fallback when corruption is detected
   */
  private recalculateBytes(): void {
    this.currentBytes = this.items.reduce((sum, entry) => {
      return sum + entry.size;
    }, 0);
    
    // Verify the recalculated value is within safe integer range
    if (this.currentBytes > Number.MAX_SAFE_INTEGER) {
      console.error('ByteBudgetRingBuffer: currentBytes exceeds safe integer range after recalculation');
      // Force clear to prevent corruption
      this.items = [];
      this.currentBytes = 0;
    }
  }

  toArray(): T[] {
    return this.items.map(entry => entry.item);
  }

  bytes(): number {
    return this.currentBytes;
  }
}
