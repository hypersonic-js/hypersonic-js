# Configuration

All Hypersonic configuration lives in a single `hypersonic.config.ts` file at your project root.

## hypersonic.config.ts

```ts
import { defineConfig } from '@hypersonic-js/complete'

export default defineConfig({
  server: {
    port: 3000,
    host: 'localhost',
  },
  database: {
    provider: 'sqlite',
  },
  auth: {
    trustedOrigins: ['http://localhost:3000'],
  },
  inertia: {
    ssr: false,
  },
})
```

`defineConfig` is a typed identity function — it gives you full autocomplete and catches typos at compile time.

## server

| Option | Type | Description |
|--------|------|-------------|
| `port` | `number` | Port the HTTP server listens on |
| `host` | `string` | Hostname to bind to |

## database

| Option | Type | Description |
|--------|------|-------------|
| `provider` | `'sqlite' \| 'postgresql'` | Database driver |

The scaffolded project uses `sqlite` with no extra setup. Switch to `postgresql` for production and update `DATABASE_URL` in your `.env`.

## auth

| Option | Type | Description |
|--------|------|-------------|
| `trustedOrigins` | `string[]` | Origins allowed to make cross-origin auth requests |
| `providers` | `{ github?: boolean, google?: boolean }` | OAuth providers to enable |
| `rateLimit.enabled` | `boolean` | Set to `false` to disable Better Auth's built-in rate limiting (useful in test environments) |

### OAuth providers

Enable a provider in config and supply its credentials in `.env`:

```ts
auth: {
  trustedOrigins: ['https://myapp.com'],
  providers: {
    github: true,
    google: true,
  },
},
```

```bash
# .env
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

The framework validates that the required env vars are present on startup and throws a descriptive error if any are missing.

## inertia

| Option | Type | Description |
|--------|------|-------------|
| `ssr` | `boolean` | Enable server-side rendering |
| `version` | `string` | Asset version string sent to clients for cache-busting |

## logging

| Option | Type | Description |
|--------|------|-------------|
| `level` | `'trace' \| 'debug' \| 'info' \| 'warn' \| 'error' \| 'fatal' \| 'silent'` | Minimum log level emitted by the Pino logger. Defaults to `'error'` when omitted |

```ts
logging: {
  level: 'debug',
},
```

## Environment variables

Hypersonic reads two required env vars at startup:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Prisma connection string |
| `BETTER_AUTH_SECRET` | Secret used to sign session tokens — minimum 32 characters |

These must be present in `.env` (or exported in your shell) before starting the server. The framework throws a descriptive error if either is missing.