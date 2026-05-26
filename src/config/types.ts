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
}

export interface HypersonicConfig {
  server: ServerConfig
  auth: AuthConfig
  inertia: InertiaConfig
}
