import type { Application } from 'express'
import type { Logger } from '../logger/index.js'
import type { HypersonicConfig } from '../config/types.js'
import type { Env } from '../config/env.js'
import type { PrismaClientLike } from '../database/client.js'
import type { AuthInstance } from '../auth/setup.js'

export interface CreateAppOptions {
  config: HypersonicConfig
  env: Env
  prisma: PrismaClientLike
}

export interface HypersonicApp {
  express: Application
  auth: AuthInstance
  /** Pino logger configured from hypersonic.config.ts — defaults to 'error' level. */
  logger: Logger
  start: () => Promise<void>
  stop: () => Promise<void>
}