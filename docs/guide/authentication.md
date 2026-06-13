# Authentication

Hypersonic uses [Better Auth](https://better-auth.com) for session management. It is wired in automatically by `createApp` — there is nothing to configure beyond `hypersonic.config.ts` and `.env`.

## How it works

`createApp` creates a Better Auth instance using your config and mounts the auth HTTP handler at `/api/auth/*`. All sign-in, sign-out, and session endpoints are served from there automatically.

```ts
const app = await createApp({ config, env, prisma })

// app.auth is the Better Auth instance — pass it to createAuthGuard
const requireAuth = createAuthGuard(app.auth)
```

## Sign up and sign in

The scaffolded project includes login and register pages that call the Better Auth client directly from React:

```ts
// resources/js/lib/auth-client.ts
import { createAuthClient } from 'better-auth/react'

export const authClient = createAuthClient({
  baseURL: 'http://localhost:3000',
})
```

### Sign in

```tsx
import { authClient } from '../../lib/auth-client'
import { router } from '@inertiajs/react'

const result = await authClient.signIn.email({
  email,
  password,
  callbackURL: '/',
})

if (result.error) {
  // show error
} else {
  router.visit('/')
}
```

### Sign up

```tsx
const result = await authClient.signUp.email({
  name,
  email,
  password,
  callbackURL: '/',
})
```

### Sign out

```tsx
await authClient.signOut()
router.visit('/login')
```

## Protecting routes

Use `createAuthGuard` to protect any Express route. Unauthenticated requests are redirected to `/login`:

```ts
import { createAuthGuard } from './src/middleware.ts'

const requireAuth = createAuthGuard(app.auth)

app.express.get('/dashboard', requireAuth, (req, res) => {
  res.inertia!('Dashboard', { user: req.sessionUser })
})
```

`req.sessionUser` is populated on every request that passes the guard. It contains the `id`, `name`, `email`, and `image` of the authenticated user.

## OAuth providers

Enable GitHub or Google OAuth in `hypersonic.config.ts` and supply credentials in `.env`:

```ts
// hypersonic.config.ts
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
GITHUB_CLIENT_ID=your-client-id
GITHUB_CLIENT_SECRET=your-client-secret
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
```

The framework validates that required OAuth env vars are present at startup and throws a descriptive error if any are missing. No code changes are needed — the provider is wired in automatically once credentials are in your config and `.env`.

## Admin access

Every new project includes a `hypersonic admin create-admin` command (run automatically by `hypersonic new`) that creates a user with `role: admin`. The admin dashboard is available at `/admin` and is protected by a separate admin auth middleware that checks for the admin role.

To create an additional admin user:

```bash
hypersonic admin create-admin
```

To promote an existing user to admin, update their `role` field directly in the database or via the admin dashboard.