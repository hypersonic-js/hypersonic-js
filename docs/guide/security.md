# Security

## What Hypersonic provides automatically

`createApp` mounts [Helmet](https://helmetjs.github.io) on every request. The following headers are set for you with no configuration required:

| Header | Value | Protection |
|--------|-------|------------|
| `X-Frame-Options` | `SAMEORIGIN` | Clickjacking |
| `X-Content-Type-Options` | `nosniff` | MIME sniffing |
| `Referrer-Policy` | `same-origin` | Referrer leakage |
| `X-Powered-By` | *(removed)* | Server fingerprinting |

`Referrer-Policy` is deliberately set to `same-origin` rather than Helmet's default of `no-referrer`. The stricter default breaks Inertia's redirect-on-error behaviour, which relies on the `Referer` header to redirect back to the originating form.

`Content-Security-Policy` is intentionally **not set** by the framework — it requires directives specific to your application. See below.

CSRF protection is also handled automatically. The Inertia middleware issues an `XSRF-TOKEN` cookie on every response and validates the matching `X-XSRF-TOKEN` header on all mutating requests (`POST`, `PUT`, `PATCH`, `DELETE`). Inertia's `useForm` reads and sends this token without any extra setup on your part.

## Content Security Policy

CSP is the most impactful header you can add. Install Helmet as a direct dependency so you can use its standalone `contentSecurityPolicy` middleware:

```bash
npm install helmet
```

Then add it in `server.ts` after `createApp`:

```ts
import helmet from 'helmet'

const app = await createApp({ config, env, prisma })

app.express.use(
  helmet.contentSecurityPolicy({
    directives: {
      defaultSrc:       ["'self'"],
      baseUri:          ["'self'"],
      fontSrc:          ["'self'", 'https:', 'data:'],
      formAction:       ["'self'"],
      frameAncestors:   ["'self'"],
      imgSrc:           ["'self'", 'data:'],
      objectSrc:        ["'none'"],
      scriptSrc:        ["'self'"],
      scriptSrcAttr:    ["'none'"],
      styleSrc:         ["'self'", 'https:', "'unsafe-inline'"],
      upgradeInsecureRequests: [],
    },
  }),
)
```

This produces the following header:

```
Content-Security-Policy: default-src 'self';base-uri 'self';font-src 'self' https: data:;form-action 'self';frame-ancestors 'self';img-src 'self' data:;object-src 'none';script-src 'self';script-src-attr 'none';style-src 'self' https: 'unsafe-inline';upgrade-insecure-requests
```

### Development

In development the Vite dev server uses a WebSocket connection for live reloading. WebSocket connections are governed by `connect-src`, and `'self'` does not cover `ws://` even for the same host. Add the WebSocket origin explicitly when `NODE_ENV` is not production:

```ts
const isDev = process.env.NODE_ENV !== 'production'

app.express.use(
  helmet.contentSecurityPolicy({
    directives: {
      defaultSrc:       ["'self'"],
      baseUri:          ["'self'"],
      fontSrc:          ["'self'", 'https:', 'data:'],
      formAction:       ["'self'"],
      frameAncestors:   ["'self'"],
      imgSrc:           ["'self'", 'data:'],
      objectSrc:        ["'none'"],
      scriptSrc:        ["'self'"],
      scriptSrcAttr:    ["'none'"],
      styleSrc:         ["'self'", 'https:', "'unsafe-inline'"],
      upgradeInsecureRequests: [],
      ...(isDev && { connectSrc: ["'self'", `ws://localhost:${config.server.port}`] }),
    },
  }),
)
```

### External resources

If your app loads anything from a third-party origin — fonts, avatars, analytics — add that origin to the relevant directive rather than reaching for wildcard sources:

```ts
imgSrc: ["'self'", 'data:', 'https://avatars.githubusercontent.com'],
```