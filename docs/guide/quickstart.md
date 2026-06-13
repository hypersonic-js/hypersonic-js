# Quick Start

This guide walks you from an empty directory to a running Hypersonic app with a database, authentication, and a React frontend.

## Requirements

- Node.js `^24.0.0`
- A Postgres database (local or hosted). [Docker](https://docs.docker.com/get-docker/) is the quickest way to spin one up locally.

::: tip SQLite alternative
If you want to skip a database server entirely, swap `postgresql` for `sqlite` in the steps below and set `DATABASE_URL="file:./dev.db"` in your `.env`. The `@prisma/adapter-pg` dependency can also be dropped.
:::

## 1. Create a project

```bash
mkdir my-app && cd my-app
npm init -y
```

Add `"type": "module"` to `package.json` — Hypersonic is ESM-only:

```json
{
  "type": "module"
}
```

## 2. Install dependencies

```bash
# Runtime
npm install @hypersonic-js/complete @prisma/adapter-pg dotenv

# Dev tools
npm install --save-dev \
  prisma @prisma/client \
  vite @vitejs/plugin-react @tailwindcss/vite tailwindcss \
  react react-dom @inertiajs/react \
  typescript @types/react @types/react-dom @types/node
```

Add scripts to `package.json`:

```json
{
  "scripts": {
    "dev": "node --experimental-strip-types server.ts",
    "build": "vite build",
    "db:migrate": "prisma migrate dev",
    "db:generate": "prisma generate"
  }
}
```

## 3. Configure Hypersonic

**`hypersonic.config.ts`** — at your project root:

```ts
import { defineConfig } from '@hypersonic-js/complete'

export default defineConfig({
  server: {
    port: 3000,
    host: 'localhost',
  },
  database: {
    provider: 'postgresql',
  },
  auth: {
    trustedOrigins: ['http://localhost:3000'],
  },
  inertia: {
    ssr: false,
  },
})
```

**`.env`** — at your project root:

```bash
DATABASE_URL="postgresql://localhost:5432/myapp"
BETTER_AUTH_SECRET="your-secret-at-least-32-characters-long"
```

## 4. Set up the database

**`prisma/schema.prisma`** — the four tables below are required by Better Auth. Add your own models underneath them.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ── Required by Better Auth ────────────────────────────────────────────────

model User {
  id            String    @id
  name          String
  email         String    @unique
  emailVerified Boolean
  image         String?
  createdAt     DateTime
  updatedAt     DateTime
  sessions      Session[]
  accounts      Account[]
}

model Session {
  id        String   @id
  expiresAt DateTime
  token     String   @unique
  createdAt DateTime
  updatedAt DateTime
  ipAddress String?
  userAgent String?
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model Account {
  id                    String    @id
  accountId             String
  providerId            String
  userId                String
  accessToken           String?
  refreshToken          String?
  idToken               String?
  accessTokenExpiresAt  DateTime?
  refreshTokenExpiresAt DateTime?
  scope                 String?
  password              String?
  createdAt             DateTime
  updatedAt             DateTime
  user                  User      @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model Verification {
  id         String    @id
  identifier String
  value      String
  expiresAt  DateTime
  createdAt  DateTime?
  updatedAt  DateTime?
}

// ── Your models go here ────────────────────────────────────────────────────
```

**`prisma.config.ts`** — tells the Prisma CLI where your schema and migrations live:

```ts
import 'dotenv/config'
import { defineConfig } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL as string,
  },
})
```

Run the first migration:

```bash
npm run db:migrate   # creates the tables
npm run db:generate  # generates the TypeScript client
```

## 5. Configure Vite

**`vite.config.ts`** — at your project root:

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'public',
    manifest: true,
    rollupOptions: {
      input: 'resources/js/app.tsx',
    },
  },
})
```

## 6. Set up the frontend

**`resources/css/app.css`**:

```css
@import "tailwindcss";
```

**`resources/js/app.tsx`** — the Inertia entry point that maps component names to React pages:

```tsx
import { createInertiaApp } from '@inertiajs/react'
import { createRoot } from 'react-dom/client'
import '../css/app.css'

createInertiaApp({
  resolve: (name) => {
    const pages = import.meta.glob('./Pages/**/*.tsx', { eager: true })
    const page = pages[`./Pages/${name}.tsx`]
    if (!page) throw new Error(`Inertia page not found: ${name}`)
    return page as never
  },
  setup({ el, App, props }) {
    createRoot(el).render(<App {...props} />)
  },
})
```

**`resources/js/Pages/Home.tsx`** — your first page:

```tsx
interface Props {
  message: string
}

export default function Home({ message }: Props) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <h1 className="text-3xl font-bold text-gray-900">{message}</h1>
    </div>
  )
}
```

## 7. Boot the server

**`server.ts`** — at your project root:

```ts
import 'dotenv/config'
import { createRequire } from 'node:module'
import type { PrismaClient as PrismaClientType } from '@prisma/client'
import {
  createApp,
  loadConfig,
  createDatabaseAdapter,
  createInertiaErrorHandler,
} from '@hypersonic-js/complete'

// PrismaClient is CommonJS — use createRequire to load it in an ESM context.
const require = createRequire(import.meta.url)
const { PrismaClient } = require('@prisma/client') as {
  PrismaClient: typeof PrismaClientType
}

const { config, env } = await loadConfig()

// Prisma v7 requires a driver adapter — never instantiate PrismaClient bare.
const adapter = await createDatabaseAdapter(config.database.provider, env.DATABASE_URL)
const prisma = new PrismaClient({ adapter })

const app = await createApp({ config, env, prisma })

// Register your routes on app.express.
app.express.get('/', (_req, res) => {
  res.inertia!('Home', { message: 'Welcome to Hypersonic!' })
})

// Mount the Inertia-aware error handler after all routes.
app.express.use(createInertiaErrorHandler())

await app.start()
console.log(`Listening on http://${config.server.host}:${config.server.port}`)
```

## 8. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you should see your Home page.

Vite's HMR is active in development: changes to React components reload instantly without a full page refresh.

## Next steps

- **[Configuration](/guide/configuration)** — all `hypersonic.config.ts` options
- **[Routing & Controllers](/guide/routing)** — writing Express route handlers
- **[Frontend](/guide/frontend)** — Inertia props, navigation, and forms
- **[Authentication](/guide/authentication)** — protecting routes and OAuth providers