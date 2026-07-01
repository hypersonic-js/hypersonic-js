/**
 * Shared no-op resource closer.
 *
 * Used as the `close()` implementation for backends that do not open any
 * external connection — `memory` and `database` — for both `createLimiter`'s
 * `Limiter` (middleware.ts) and `buildAuthLimitsConfig`'s
 * `BetterAuthLimitsConfig` (auth-storage.ts). Defined once here so neither
 * module declares its own inline `async () => {}`.
 */
export async function noopClose(): Promise<void> {
  // Intentionally empty — memory and database backends own no external
  // resource that needs releasing.
}