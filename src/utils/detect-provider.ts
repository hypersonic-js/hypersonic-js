export type DatabaseProvider = 'postgresql' | 'mysql' | 'sqlite' | 'mongodb'

/**
 * Infers the database provider from the DATABASE_URL scheme.
 * Used internally to configure Better Auth's Prisma adapter
 * without requiring the developer to repeat the provider in hypersonic.config.ts.
 */
export function detectProvider(databaseUrl: string): DatabaseProvider {
  if (
    databaseUrl.startsWith('postgresql://') ||
    databaseUrl.startsWith('postgres://')
  ) {
    return 'postgresql'
  }

  if (
    databaseUrl.startsWith('mysql://') ||
    databaseUrl.startsWith('mysql2://')
  ) {
    return 'mysql'
  }

  if (
    databaseUrl.startsWith('mongodb://') ||
    databaseUrl.startsWith('mongodb+srv://')
  ) {
    return 'mongodb'
  }

  return 'sqlite'
}
