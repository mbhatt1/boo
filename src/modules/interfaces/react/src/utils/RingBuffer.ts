export class RingBuffer<T> {
  private buf: T[];
  private head = 0;
  private _size = 0;
  constructor(private readonly cap: number) {
    if (cap <= 0 || !Number.isFinite(cap)) throw new Error('RingBuffer capacity must be > 0');
    this.buf = new Array(cap);
  }
  
  get capacity(): number {
    return this.cap;
  }
  
  get size(): number {
    return this._size;
  }
  
  isEmpty(): boolean {
    return this._size === 0;
  }
  
  isFull(): boolean {
    return this._size === this.cap;
  }
  
  push(x: T) {
    const idx = (this.head + this._size) % this.cap;
    this.buf[idx] = x as any;
    if (this._size < this.cap) {
      this._size += 1;
    } else {
      this.head = (this.head + 1) % this.cap;
    }
  }
  
  pop(): T | undefined {
    if (this._size === 0) {
      return undefined;
    }
    const idx = (this.head + this._size - 1) % this.cap;
    const item = this.buf[idx];
    this._size -= 1;
    return item;
  }
  
  peek(): T | undefined {
    if (this._size === 0) {
      return undefined;
    }
    const idx = (this.head + this._size - 1) % this.cap;
    return this.buf[idx];
  }
  
  pushMany(items: T[]) {
    for (const it of items) this.push(it);
  }
  
  clear() {
    this.head = 0;
    this._size = 0;
  }
  
  toArray(): T[] {
    const out: T[] = new Array(this._size);
    for (let i = 0; i < this._size; i++) {
      out[i] = this.buf[(this.head + i) % this.cap] as any;
    }
    return out;
  }
}
