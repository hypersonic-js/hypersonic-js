# Rate Limiting

`@hypersonic-js/limits` adds rate limiting to two places: any route you choose, via its own middleware, and Better Auth's auth endpoints (sign-up, sign-in, etc.), which it wires up automatically once configured. Both share the same storage backend.

```bash
npm install @hypersonic-js/limits
```

Rate limiting is opt-in — nothing is limited until you add a `limits` block to `hypersonic.config.ts`.

## Choosing a backend

| Backend | Storage | Requirements |
|---------|---------|---------------|
| `memory` | In-process `Map` | None — zero config, single-server only |
| `database` | Prisma | `RateLimit` + `AuthRateLimit` models in your schema |
| `redis` | Redis | `REDIS_URL` in `.env`, plus a `window` (seconds) |

```ts
// hypersonic.config.ts
import { defineConfig } from '@hypersonic-js/complete'

export default defineConfig({
  // ...
  limits: {
    backend: 'redis',
    window: 60, // seconds — TTL for each auth-endpoint rate-limit record
  },
})
```

`window` only exists on the `redis` variant — it's the TTL used so expired rate-limit keys are cleaned up automatically instead of accumulating in Redis. The `memory` backend is garbage-collected with the process, and the `database` backend's upsert-per-key row doesn't need a TTL to stay bounded, so neither needs it.

## Wiring the auth endpoints

Pass `buildAuthLimitsConfig` as `createApp`'s `limitsPlugin` option so Better Auth's own endpoints share the backend you configured above:

```ts
import { createApp } from '@hypersonic-js/complete'
import { buildAuthLimitsConfig } from '@hypersonic-js/limits'

const app = await createApp({
  config,
  env,
  prisma,
  limitsPlugin: buildAuthLimitsConfig,
})
```

`createApp` only resolves this wiring when `config.limits` is set. The existing [`auth.rateLimit.enabled: false`](/guide/configuration#auth) override still takes priority — set it in test environments to suppress rate limiting even when `limits` is configured.

## Database backend schema

If you're using `backend: 'database'`, your Prisma schema needs these two models (they're already present, commented, in a scaffolded project — just uncomment them):

```prisma
model RateLimit {
  id         String    @id @default(cuid())
  key        String    @unique
  points     Int       @default(0)
  expireAt   DateTime?
  blockUntil DateTime?
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt

  @@map("rate_limits")
}

model AuthRateLimit {
  id          String @id @default(cuid())
  key         String @unique
  count       Int    @default(0)
  lastRequest BigInt

  @@map("auth_rate_limits")
}
```

Run [`npm run db:migrate`](/guide/cli#npm-run-db-migrate) after adding them.

## Rate limiting your own routes

Use `createLimiter()` to build middleware for any route — independent of the auth-endpoint wiring above:

```ts
import { createLimiter } from '@hypersonic-js/limits'

const limiter = await createLimiter({
  config: { backend: config.limits.backend },
  env,
  prisma, // only required for the database backend
})

app.express.post(
  '/api/auth/login',
  limiter.limit({ name: 'login', requests: 5, windowMs: 60_000, blockDuration: 300_000 }),
  loginHandler,
)
```

| Option | Type | Description |
|--------|------|--------------|
| `name` | `string` | Unique identifier for this route's counter. Must be unique per limiter — a duplicate throws. |
| `requests` | `number` | Maximum requests allowed within `windowMs` |
| `windowMs` | `number` | Rolling window size, in milliseconds |
| `blockDuration` | `number` (optional) | Blocks a client for this many milliseconds after they exceed the limit, independent of the rolling window |
| `message` | `string` (optional) | Body of the 429 response. Defaults to `'Too many requests, please try again later.'` |

## Releasing resources

Call `close()` during shutdown to release any open connection (e.g. Redis) for limiters with a bounded lifetime:

```ts
await limiter.close()
```

The auth-endpoint limiter's own connection is released automatically when `app.stop()` is called — you only need this for limiters you construct yourself.

## See also

[Security](/guide/security) covers the rest of Hypersonic's built-in protections — headers, CSRF, and Content Security Policy.