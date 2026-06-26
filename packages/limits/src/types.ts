export type LimitsBackend = 'memory' | 'database' | 'redis'

export interface LimitsConfig {
  backend: LimitsBackend
}

export interface LimitOptions {
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
