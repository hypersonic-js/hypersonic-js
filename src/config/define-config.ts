import type { HypersonicConfig } from './types.js'

/**
 * Type-safe helper for defining your Hypersonic configuration.
 * Use this as the default export in hypersonic.config.ts.
 */
export function defineConfig(config: HypersonicConfig): HypersonicConfig {
  return config
}
