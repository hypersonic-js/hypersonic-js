export interface PrismaClientLike {
  $disconnect(): Promise<void>
}

let instance: PrismaClientLike | null = null

/**
 * Registers the application's PrismaClient instance.
 * Called automatically by createApp() — pass your PrismaClient there.
 */
export function setPrismaClient(client: PrismaClientLike): void {
  instance = client
}

/**
 * Returns the registered PrismaClient instance.
 * Throws if createApp() has not been called yet.
 */
export function getPrismaClient(): PrismaClientLike {
  if (instance === null) {
    throw new Error(
      'Hypersonic: PrismaClient has not been initialised. ' +
        'Pass your PrismaClient instance to createApp({ prisma }).',
    )
  }
  return instance
}

/**
 * Disconnects the PrismaClient and clears the singleton.
 * Called automatically by app.stop().
 */
export async function disconnectPrismaClient(): Promise<void> {
  if (instance !== null) {
    await instance.$disconnect()
    instance = null
  }
}
