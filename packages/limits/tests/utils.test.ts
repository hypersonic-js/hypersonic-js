import { describe, it, expect } from 'vitest'
import { noopClose } from '../src/utils.js'

describe('noopClose', () => {
  it('resolves without throwing', async () => {
    await expect(noopClose()).resolves.toBeUndefined()
  })

  it('returns a promise', () => {
    const result = noopClose()
    expect(result).toBeInstanceOf(Promise)
  })
})