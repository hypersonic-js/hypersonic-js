import type { Application } from 'express'
import type { HypersonicConfig } from '../config/types.js'
import type { Env } from '../config/env.js'
import type { PrismaClientLike } from '../database/client.js'

export interface CreateAppOptions {
  config: HypersonicConfig
  env: Env
  prisma: PrismaClientLike
}

export interface HypersonicApp {
  express: Application
  start: () => Promise<void>
  stop: () => Promise<void>
}
