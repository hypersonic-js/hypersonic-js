export type { LimitsBackend, LimitsConfig } from '@hypersonic-js/core'

export interface LimitOptions {
  /**
   * Unique identifier for this route's rate limiter. Used to namespace the
   * underlying counter (in Redis key prefixes and Prisma `rateLimit` rows)
   * so that two different routes on the same `Limiter` never share a
   * counter or window configuration for the same client, even though they
   * may share one underlying store/connection. Must be unique across every
   * `.limit()` call made on the same `Limiter` — `createLimiter()` throws
   * if the same name is reused.
   */
  name: string
  /** Maximum number of requests allowed within windowMs. */
  requests: number
  /** Time window in milliseconds before the counter resets. */
  windowMs: number
  /**
   * Optional duration in milliseconds to block a client after they exceed
   * the limit — independent of the rolling window. If omitted, clients are
   * blocked only for the remainder of the current window.
   */
  blockDuration?: number
  /** Message returned in the 429 JSON response body. */
  message?: string
}