# @hypersonic/test-app

Integration test application for the Hypersonic.js framework. Uses a real Postgres
database via Docker to exercise framework features against the same database driver
your production users will run.

## Prerequisites

This is a **pnpm monorepo**. Install dependencies from the **repo root** before
doing anything else:

```bash
# From the repo root
pnpm install
```

You never need to `cd` into `packages/core` to build or test it — Turbo handles
that automatically whenever you run a command that depends on it.

## First-time setup

Run these from `apps/test-app`:

```bash
cd apps/test-app

# 1. Copy the env file
cp .env.example .env

# 2. Start Postgres
npm run db:up

# 3. Apply migrations and generate the Prisma client
npm run db:migrate
npm run db:generate
```

## Running the app

From `apps/test-app`:

```bash
npm run dev
```

Or from the **repo root** (Turbo builds the library first automatically):

```bash
turbo dev --filter=@hypersonic/test-app
```

The app starts at `http://localhost:3000`.

| Route              | Auth required | Description                        |
|--------------------|---------------|------------------------------------|
| `GET /health`      | No            | Returns `{ status: "ok" }`         |
| `GET /login`       | No            | Renders the `Auth/Login` Inertia page |
| `GET /posts`       | Yes           | Inertia-rendered posts index page  |
| `GET /posts/:id`   | Yes           | Inertia-rendered single post page  |
| `POST /posts`      | Yes           | Creates a new post, redirects to `/posts` |
| `DELETE /posts/:id`| Yes (owner)   | Deletes a post, redirects to `/posts` |

Unauthenticated requests to protected routes redirect to `/login`.

## Running tests

From the **repo root** (recommended — Turbo ensures the library is built first):

```bash
# All packages
pnpm test

# Test-app only
pnpm test --filter=@hypersonic/test-app

# Core library only
pnpm test --filter=@hypersonic/core
```

Or directly from `apps/test-app` (requires the library to already be built):

```bash
npm run test
npm run test:coverage
```

## Database commands

Run these from `apps/test-app`:

| Command              | Description                                   |
|----------------------|-----------------------------------------------|
| `npm run db:up`      | Start the Postgres container                  |
| `npm run db:down`    | Stop the Postgres container (keeps data)      |
| `npm run db:reset`   | Tear down volume, restart, re-run migrations  |
| `npm run db:migrate` | Apply pending Prisma migrations               |
| `npm run db:generate`| Regenerate the Prisma client after schema changes |