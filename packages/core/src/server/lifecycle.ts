import type { Server } from 'node:http'
import type { Application } from 'express'
import type { HypersonicConfig } from '../config/types.js'
import { disconnectPrismaClient } from '../database/client.js'

export interface Lifecycle {
  start: () => Promise<void>
  stop: () => Promise<void>
}

/**
 * Builds the start/stop lifecycle for a Hypersonic app's HTTP server.
 *
 * `onStop`, when provided, is awaited during `stop()` alongside disconnecting
 * Prisma — used by `createApp` to release the Redis connection opened for
 * Better Auth's `secondaryStorage` when `config.limits.backend` is `'redis'`.
 * Not part of core's public API — internal to `createApp`.
 */
export function createLifecycle(
  app: Application,
  config: HypersonicConfig,
  onStop?: () => Promise<void>,
): Lifecycle {
  let server: Server | null = null

  async function start(): Promise<void> {
    return new Promise((resolve, reject) => {
      server = app.listen(config.server.port, config.server.host, () => {
        resolve()
      })
      server.on('error', reject)
    })
  }

  function closeServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (server === null) {
        resolve()
        return
      }

      const closing = server
      server = null

      closing.close((err) => {
        if (err !== undefined) {
          reject(err)
        } else {
          resolve()
        }
      })
    })
  }

  /**
   * Disconnects Prisma and awaits `onStop`, then closes the HTTP server.
   * The server close is guaranteed via `finally` so a rejection from either
   * step never leaves the listener open. The original error (from Prisma or
   * `onStop`) still propagates to the caller unless closing the server also
   * fails — in that case the close error takes precedence, per standard
   * try/finally semantics.
   */
  async function stop(): Promise<void> {
    try {
      await disconnectPrismaClient()

      if (onStop !== undefined) {
        await onStop()
      }
    } finally {
      await closeServer()
    }
  }

  return { start, stop }
}