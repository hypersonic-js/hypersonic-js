# @hypersonic/test-app

Integration test application for the Hypersonic.js framework. Uses a real Postgres
database via Docker to exercise framework features against the same database driver
your production users will run.

## First-time setup

```bash
# 1. Copy the env file
cp .env.example .env

# 2. Start Postgres
npm run db:up

# 3. Apply migrations and generate the Prisma client
npm run db:migrate
npm run db:generate
```

## Running the app

```bash
npm run dev
```

The app starts at `http://localhost:3000`.

| Route       | Description                          |
|-------------|--------------------------------------|
| `GET /health` | Returns `{ status: "ok" }`         |
| `GET /posts`  | Inertia-rendered posts index page  |

## Database commands

| Command             | Description                                  |
|---------------------|----------------------------------------------|
| `npm run db:up`     | Start the Postgres container                 |
| `npm run db:down`   | Stop the Postgres container (keeps data)     |
| `npm run db:reset`  | Tear down volume, restart, re-run migrations |
| `npm run db:migrate`| Apply pending Prisma migrations              |