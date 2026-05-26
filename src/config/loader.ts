import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { HypersonicConfig } from './types.js'
import { validateEnv, type Env } from './env.js'

export interface LoadedConfig {
  config: HypersonicConfig
  env: Env
}

/**
 * Isolated so tests can inject a mock importer without touching the filesystem.
 */
export async function importConfigFile(
  configUrl: string,
): Promise<{ default?: HypersonicConfig }> {
  return import(configUrl) as Promise<{ default?: HypersonicConfig }>
}

/**
 * Loads hypersonic.config.ts from the project root, validates all required
 * environment variables, and returns the resolved config + env.
 *
 * @param cwd       - project root (defaults to process.cwd())
 * @param rawEnv    - environment variables (defaults to process.env)
 * @param importer  - override the dynamic import for testing
 */
export async function loadConfig(
  cwd: string = process.cwd(),
  rawEnv: NodeJS.ProcessEnv = process.env,
  importer: (url: string) => Promise<{ default?: HypersonicConfig }> = importConfigFile,
): Promise<LoadedConfig> {
  const configPath = resolve(cwd, 'hypersonic.config.ts')
  const configUrl = pathToFileURL(configPath).href

  let mod: { default?: HypersonicConfig }

  try {
    mod = await importer(configUrl)
  } catch (err) {
    throw new Error(
      `Hypersonic: Failed to load hypersonic.config.ts at ${configPath}.\n` +
        `Make sure the file exists and has a valid default export.\n` +
        `Detail: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  if (mod.default === undefined || mod.default === null) {
    throw new Error(
      'Hypersonic: hypersonic.config.ts must export a config via defineConfig() as the default export.',
    )
  }

  const config = mod.default
  const env = validateEnv(config, rawEnv)

  return { config, env }
}
