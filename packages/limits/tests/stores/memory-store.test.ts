import { describe, it, expect } from 'vitest'
import { createMemoryStore } from '../../src/stores/memory-store.js'

describe('createMemoryStore', () => {
  it('returns an object with an increment method', () => {
    const store = createMemoryStore()
    expect(typeof store.increment).toBe('function')
  })

  it('returns an object with a decrement method', () => {
    const store = createMemoryStore()
    expect(typeof store.decrement).toBe('function')
  })

  it('returns an object with a resetKey method', () => {
    const store = createMemoryStore()
    expect(typeof store.resetKey).toBe('function')
  })

  it('each call returns an independent store instance', () => {
    const storeA = createMemoryStore()
    const storeB = createMemoryStore()
    expect(storeA).not.toBe(storeB)
  })

  it('returns a store that tracks hits independently per instance', async () => {
    const storeA = createMemoryStore()
    const storeB = createMemoryStore()

    // Increment storeA twice
    await storeA.increment('key')
    const { totalHits } = await storeA.increment('key')

    // storeB should be unaffected
    const { totalHits: bHits } = await storeB.increment('key')

    expect(totalHits).toBe(2)
    expect(bHits).toBe(1)
  })
})
