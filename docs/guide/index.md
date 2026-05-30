# Introduction

Hypersonic.js is a full-stack TypeScript framework inspired by Django's "batteries included" philosophy. One install gives you a production-ready backend, a React frontend with SSR, a database ORM, and authentication — all pre-wired and type-safe end to end.


## Requirements

- Node.js `^24.0.0`
- A supported database (Postgres, MySQL, MongoDB, or SQLite)

## Installation

```bash
npm install @hypersonic/complete
npm install --save-dev prisma @prisma/client
```

Or install only what you need:

```bash
npm install @hypersonic/core
```

## Quick start

**`hypersonic.config.ts`** at your project root:

```ts
import { defineConfig } from '@hypersonic/complete'

export default defineConfig({
  server: {
    port: 3000,
    host: 'localhost',
  },
  auth: {
    trustedOrigins: ['http://localhost:3000'],
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
import { createApp, loadConfig } from '@hypersonic/complete'

const { config, env } = await loadConfig()
const app = await createApp({ config, env, prisma: new PrismaClient() })

await app.start()
```

## Core stack

| Layer | Library |
|---|---|
| HTTP server | Express 5 |
| Database ORM | Prisma |
| Frontend bridge | Inertia.js + React |
| Styling | Tailwind CSS 4 |
| Authentication | Better Auth |

More guides coming soon.