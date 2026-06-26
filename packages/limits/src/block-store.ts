/**
 * Abstraction for tracking clients that have been explicitly blocked
 * for a fixed duration after exceeding the rate limit.
 *
 * This is separate from the express-rate-limit hit-count store —
 * a blocked client is rejected before the counter is even consulted.
 */
export interface BlockStore {
  isBlocked(key: string): Promise<boolean>
  block(key: string, durationMs: number): Promise<void>
}

/**
 * In-process Map-backed implementation. Suitable for single-server
 * deployments using the memory backend. Expired entries are lazily
 * evicted on the next isBlocked call for that key.
 */
export class MemoryBlockStore implements BlockStore {
  private readonly blocks = new Map<string, number>()

  async isBlocked(key: string): Promise<boolean> {
    const expiry = this.blocks.get(key)
    if (expiry === undefined) return false
    if (Date.now() >= expiry) {
      this.blocks.delete(key)
      return false
    }
    return true
  }

  async block(key: string, durationMs: number): Promise<void> {
    this.blocks.set(key, Date.now() + durationMs)
  }

  /** Clears all block entries — intended for test teardown only. */
  clear(): void {
    this.blocks.clear()
  }
}
