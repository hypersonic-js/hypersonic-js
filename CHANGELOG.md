# Changelog

## 0.0.1 — 2026-05-26

Initial release of `@hypersonic/core`.

### Included

- **Config** — `defineConfig()` + `loadConfig()` with Zod-based env validation derived from config
- **Server** — `createApp()` Express 5 factory with graceful `start()` / `stop()`
- **Database** — Prisma 7 singleton (`setPrismaClient` / `getPrismaClient` / `disconnectPrismaClient`)
- **Auth** — Better Auth 1.6 pre-wired to Prisma, mounts on `/api/auth/*`, optional GitHub/Google OAuth
- **Inertia** — Full Inertia v3 protocol (XHR JSON, initial HTML, asset version mismatch 409) + Vite 8 dev/prod integration with Tailwind v4
- **Utils** — HTTP error hierarchy (`HttpError`, `NotFoundError`, `UnauthorizedError`, `ForbiddenError`, `ValidationError`) + `detectProvider()`
