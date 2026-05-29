# @hypersonic/core

The core of **Hypersonic.js** — a modern Django-inspired full-stack TypeScript framework. One install gives you Express, Inertia + React + Vite + Tailwind, Prisma, and Better Auth, all pre-wired together.

📖 **[hypersonic-js.com](https://hypersonic-js.com)**

## Install

```bash
npm install @hypersonic/core
npm install --save-dev prisma @prisma/client
```

For a single-package install of everything, use [`@hypersonic/complete`](https://www.npmjs.com/package/@hypersonic/complete) instead.

## Quick start

**`hypersonic.config.ts`** at your project root:

```ts
import { defineConfig } from '@hypersonic/core'

export default defineConfig({
  server: { port: 3000, host: 'localhost' },
  auth: { trustedOrigins: ['http://localhost:3000'] },
  inertia: { ssr: true },
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
```

Full documentation at **[hypersonic-js.com](https://hypersonic-js.com)**.

## License

MIT © [Zesuperaker](https://github.com/Zesuperaker)