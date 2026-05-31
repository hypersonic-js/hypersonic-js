import type { DatabaseProvider } from '../config/types.js'

/**
 * Creates the Prisma v7 driver adapter for the given provider and DATABASE_URL.
 *
 * Adapter packages are dynamic-imported so only the one matching the user's
 * installed driver is loaded at runtime — no unused adapter is bundled.
 *
 * Supported providers and their required packages:
 *  - postgresql → @prisma/adapter-pg
 *  - sqlite     → @prisma/adapter-better-sqlite3 + better-sqlite3
 */
export async function createDatabaseAdapter(
  provider: DatabaseProvider,
  databaseUrl: string,
): Promise<unknown> {
  if (provider === 'postgresql') {
    const { PrismaPg } = await import('@prisma/adapter-pg')
    return new PrismaPg({ connectionString: databaseUrl })
  }

  if (provider === 'sqlite') {
    const { PrismaBetterSqlite3 } = await import('@prisma/adapter-better-sqlite3')
    return new PrismaBetterSqlite3({ url: databaseUrl })
  }

  // TypeScript makes this unreachable for well-typed callers, but keep as a
  // runtime safety net for any JS callers or future provider additions.
  throw new Error(
    `Hypersonic: unsupported database provider "${provider as string}". ` +
      `Supported providers are: postgresql, sqlite.`,
  )
}