import { MemoryStore } from 'express-rate-limit'
import type { Store } from 'express-rate-limit'

/**
 * Returns a fresh express-rate-limit MemoryStore.
 * Each call produces an independent store so multiple limit() invocations
 * on different routes do not share state.
 */
export function createMemoryStore(): Store {
  return new MemoryStore()
}
