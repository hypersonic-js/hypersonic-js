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

| Route                 | Auth required        | Description                                     |
|-----------------------|----------------------|-------------------------------------------------|
| `GET /health`         | No                   | Returns `{ status: "ok" }`                      |
| `GET /login`          | No                   | Renders the `Auth/Login` Inertia page           |
| `GET /register`       | No                   | Renders the `Auth/Register` Inertia page        |
| `GET /posts`          | Yes                  | Inertia-rendered posts index page               |
| `GET /posts/:id`      | Yes                  | Inertia-rendered single post page               |
| `POST /posts`         | Yes                  | Creates a new post, redirects to `/posts`       |
| `DELETE /posts/:id`   | Yes (owner)          | Deletes a post, redirects to `/posts`           |
| `GET /admin`          | Yes (admin email)    | Admin dashboard — lists all visible models      |
| `GET /admin/:model`   | Yes (admin email)    | Paginated record list for a model               |
| `GET /admin/:model/new` | Yes (admin email)  | Create form for a model                         |
| `GET /admin/:model/:id` | Yes (admin email)  | Edit form for a record                          |
| `POST /admin/:model`  | Yes (admin email)    | Creates a record, redirects to model index      |
| `PATCH /admin/:model/:id` | Yes (admin email) | Updates a record, redirects to model index    |
| `DELETE /admin/:model/:id` | Yes (admin email) | Deletes a record, redirects to model index  |

Unauthenticated requests to protected routes redirect to `/login`.
Admin routes return `403 Forbidden` for users whose email is not in `ADMIN_EMAILS`.

## Environment variables

| Variable        | Required | Description                                                      |
|-----------------|----------|------------------------------------------------------------------|
| `DATABASE_URL`  | Yes      | Postgres connection string                                       |
| `BETTER_AUTH_SECRET` | Yes | Secret key for Better Auth (min 32 chars)                   |
| `ADMIN_EMAILS`  | No       | Comma-separated list of emails granted access to `/admin`        |

Example `.env`:

```dotenv
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/hypersonic_test"
BETTER_AUTH_SECRET="change-me-to-a-random-32-char-secret!!"
ADMIN_EMAILS="you@example.com"
```

> **Note:** The admin dashboard uses the scaffolded pages from `@hypersonic-js/admin`.
> Run `hypersonic admin scaffold` once to generate
> `resources/js/Pages/Admin/{Dashboard,ModelIndex,ModelForm}.tsx`.

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

### Test files

| File                       | What it covers                                              |
|----------------------------|-------------------------------------------------------------|
| `tests/routes.test.ts`     | All app routes and the `parseId` utility                    |
| `tests/middleware.test.ts` | `createAuthGuard` — session checking and req patching       |
| `tests/admin.test.ts`      | `mountAdmin` integration with the test-app's Prisma schema  |

## Database commands

Run these from `apps/test-app`:

| Command              | Description                                   |
|----------------------|-----------------------------------------------|
| `npm run db:up`      | Start the Postgres container                  |
| `npm run db:down`    | Stop the Postgres container (keeps data)      |
| `npm run db:reset`   | Tear down volume, restart, re-run migrations  |
| `npm run db:migrate` | Apply pending Prisma migrations               |
| `npm run db:generate`| Regenerate the Prisma client after schema changes |