# @hypersonic/core

The core of **Hypersonic.js** — a modern Django-inspired full-stack TypeScript framework. One `npm install` gives you Express, Inertia + React + Vite + Tailwind, Prisma, and Better Auth, all pre-wired together.

## Install

```bash
npm install @hypersonic/core
npm install --save-dev prisma @prisma/client
```

## Quick start

**`hypersonic.config.ts`** — project root:

```ts
import { defineConfig } from '@hypersonic/core'

export default defineConfig({
  server: {
    port: 3000,
    host: 'localhost',
  },
  auth: {
    trustedOrigins: ['http://localhost:3000'],
    // providers: { github: true, google: true },  // optional OAuth
  },
  inertia: {
    ssr: true,
  },
})
```

**`.env`**:

```bash
DATABASE_URL="postgresql://localhost:5432/myapp"
BETTER_AUTH_SECRET="your-secret-at-least-32-characters-long"
```

**`server.ts`**:

```ts
import { PrismaClient } from '@prisma/client'
import { createApp, loadConfig } from '@hypersonic/core'

const { config, env } = await loadConfig()
const app = await createApp({ config, env, prisma: new PrismaClient() })

await app.start()
console.log(`Listening on http://${config.server.host}:${config.server.port}`)
```

**Route using Inertia**:

```ts
app.express.get('/users', async (req, res) => {
  const users = await prisma.user.findMany()
  res.inertia!('Users/Index', { users })
})
```

## Architecture

| Layer | Library | Version |
|---|---|---|
| HTTP server | Express | 5.2.1 |
| Database ORM | Prisma | 7.8.0 |
| Frontend bridge | Inertia.js | 3.0.3 |
| UI framework | React + Vite + Tailwind | 19 / 8 / 4 |
| Authentication | Better Auth | 1.6.11 |

## Environment variables

| Variable | Required | When |
|---|---|---|
| `DATABASE_URL` | Always | — |
| `BETTER_AUTH_SECRET` | Always | Min 32 chars |
| `GITHUB_CLIENT_ID` | When `providers.github: true` | — |
| `GITHUB_CLIENT_SECRET` | When `providers.github: true` | — |
| `GOOGLE_CLIENT_ID` | When `providers.google: true` | — |
| `GOOGLE_CLIENT_SECRET` | When `providers.google: true` | — |

## Exported utilities

```ts
import {
  // Config
  defineConfig, loadConfig, validateEnv,

  // Server
  createApp,

  // Database
  getPrismaClient, setPrismaClient, disconnectPrismaClient,

  // Auth
  createAuth, mountAuth,

  // Inertia
  createInertiaMiddleware, createViteSetup,

  // Errors
  HttpError, NotFoundError, UnauthorizedError, ForbiddenError, ValidationError,

  // Utils
  detectProvider,
} from '@hypersonic/core'
```

## License

MIT © [Zesuperaker](https://github.com/Zesuperaker)
