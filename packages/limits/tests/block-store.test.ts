import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { MemoryBlockStore } from '../src/block-store.js'

describe('MemoryBlockStore', () => {
  let store: MemoryBlockStore

  beforeEach(() => {
    store = new MemoryBlockStore()
  })

  afterEach(() => {
    store.clear()
    vi.useRealTimers()
  })

  // ── isBlocked ──────────────────────────────────────────────────────────────

  it('returns false when the key has never been blocked', async () => {
    expect(await store.isBlocked('192.168.1.1')).toBe(false)
  })

  it('returns false for a different key that was not blocked', async () => {
    await store.block('10.0.0.1', 5000)
    expect(await store.isBlocked('192.168.1.1')).toBe(false)
  })

  it('returns true immediately after a key is blocked', async () => {
    await store.block('192.168.1.1', 5000)
    expect(await store.isBlocked('192.168.1.1')).toBe(true)
  })

  it('returns false after the block duration has expired', async () => {
    vi.useFakeTimers()
    await store.block('192.168.1.1', 1000)
    vi.advanceTimersByTime(1001)
    expect(await store.isBlocked('192.168.1.1')).toBe(false)
  })

  it('lazily evicts expired entries on isBlocked', async () => {
    vi.useFakeTimers()
    await store.block('192.168.1.1', 100)
    vi.advanceTimersByTime(200)
    // First call evicts the expired entry
    expect(await store.isBlocked('192.168.1.1')).toBe(false)
    // Calling again on a now-clean map also returns false
    expect(await store.isBlocked('192.168.1.1')).toBe(false)
  })

  // ── block ──────────────────────────────────────────────────────────────────

  it('overwrites an existing block with a new duration', async () => {
    vi.useFakeTimers()
    await store.block('192.168.1.1', 1000)
    vi.advanceTimersByTime(500)
    // Re-block with a fresh 5-second window
    await store.block('192.168.1.1', 5000)
    vi.advanceTimersByTime(1000)
    // Should still be blocked (original 1s would have expired, new 5s has not)
    expect(await store.isBlocked('192.168.1.1')).toBe(true)
  })

  it('treats a zero-ms block as immediately expired', async () => {
    vi.useFakeTimers()
    await store.block('192.168.1.1', 0)
    vi.advanceTimersByTime(1)
    expect(await store.isBlocked('192.168.1.1')).toBe(false)
  })

  // ── clear ──────────────────────────────────────────────────────────────────

  it('clear removes all blocked entries', async () => {
    await store.block('192.168.1.1', 60_000)
    await store.block('10.0.0.2', 60_000)
    store.clear()
    expect(await store.isBlocked('192.168.1.1')).toBe(false)
    expect(await store.isBlocked('10.0.0.2')).toBe(false)
  })
})
