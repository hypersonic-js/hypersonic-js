import type { Server } from 'node:http'
import type { Application } from 'express'
import type { HypersonicConfig } from '../config/types.js'
import { disconnectPrismaClient } from '../database/client.js'

export interface Lifecycle {
  start: () => Promise<void>
  stop: () => Promise<void>
}

export function createLifecycle(app: Application, config: HypersonicConfig): Lifecycle {
  let server: Server | null = null

  async function start(): Promise<void> {
    return new Promise((resolve, reject) => {
      server = app.listen(config.server.port, config.server.host, () => {
        resolve()
      })
      server.on('error', reject)
    })
  }

  async function stop(): Promise<void> {
    await disconnectPrismaClient()

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

  return { start, stop }
}
