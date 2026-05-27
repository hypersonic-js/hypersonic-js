import { describe, it, expect, beforeEach } from 'vitest'
import {
  getPrismaClient,
  setPrismaClient,
  disconnectPrismaClient,
} from '../src/database/client.js'
import type { PrismaClientLike } from '../src/database/client.js'

function makeMockPrisma(): PrismaClientLike & { disconnectCalled: boolean } {
  return {
    disconnectCalled: false,
    $disconnect: async function () {
      this.disconnectCalled = true
    },
  }
}

describe('Prisma singleton', () => {
  beforeEach(async () => {
    // Reset singleton between tests
    await disconnectPrismaClient()
  })

  it('throws when getPrismaClient is called before setPrismaClient', () => {
    expect(() => getPrismaClient()).toThrowError(/not been initialised/)
  })

  it('returns the registered instance after setPrismaClient', () => {
    const mock = makeMockPrisma()
    setPrismaClient(mock)
    expect(getPrismaClient()).toBe(mock)
  })

  it('allows replacing the registered instance', () => {
    const first = makeMockPrisma()
    const second = makeMockPrisma()
    setPrismaClient(first)
    setPrismaClient(second)
    expect(getPrismaClient()).toBe(second)
  })

  it('disconnects and clears the instance', async () => {
    const mock = makeMockPrisma()
    setPrismaClient(mock)
    await disconnectPrismaClient()
    expect(mock.disconnectCalled).toBe(true)
    expect(() => getPrismaClient()).toThrowError(/not been initialised/)
  })

  it('disconnectPrismaClient is a no-op when nothing is registered', async () => {
    await expect(disconnectPrismaClient()).resolves.toBeUndefined()
  })
})
