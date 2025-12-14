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
    this.byteLimit = Math.max(1024, byteLimit | 0);
    const defaultEstimator = (item: any) => {
      // Roughly estimate size focusing on common fields
      try {
        if (item == null) return 0;
        let bytes = 64; // base overhead per item
        if (typeof item === 'string') return bytes + item.length;
        if (typeof item === 'object') {
          const s = item as any;
          const addStr = (v: any) => {
            if (typeof v === 'string') bytes += v.length;
          };
          addStr(s.content);
          addStr(s.command);
          addStr(s.message);
          addStr(s.tool_name);
          addStr(s.tool);
          // If content is non-string but serializable, add minimal
          if (s.content && typeof s.content === 'object' && !Array.isArray(s.content)) {
            bytes += 128;
          }
          return bytes;
        }
        return 32;
      } catch {
        return 128;
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

  size(): number {
    return this.items.length;
  }

  bytes(): number {
    return this.currentBytes;
  }
}
