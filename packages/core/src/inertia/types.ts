import type { RequestHandler } from 'express'

export interface InertiaPage {
  component: string
  props: Record<string, unknown>
  url: string
  version: string
}

export interface InertiaOptions {
  ssr: boolean
  version?: string
}

export interface ViteSetup {
  middleware: RequestHandler
  assetTags: () => string
}

/**
 * Augment Express Response with an optional res.inertia() helper.
 * It is optional in the type because it is added at runtime by the middleware.
 * After createInertiaMiddleware() mounts, it is always present on res.
 */
declare module 'express' {
  interface Response {
    inertia?: (component: string, props?: Record<string, unknown>) => void
  }
}
