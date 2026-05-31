export type DatabaseProvider = 'postgresql' | 'sqlite'

export interface DatabaseConfig {
  provider: DatabaseProvider
}

export interface ServerConfig {
  port: number
  host: string
}

export interface AuthProviders {
  github?: boolean
  google?: boolean
}

export interface AuthConfig {
  trustedOrigins: string[]
  providers?: AuthProviders
}

export interface InertiaConfig {
  ssr: boolean
  version?: string
}

export interface HypersonicConfig {
  server: ServerConfig
  auth: AuthConfig
  inertia: InertiaConfig
  database: DatabaseConfig
}