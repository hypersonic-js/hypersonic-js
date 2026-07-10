// Real, importable fixture used by loader.test coverage for importConfigFile —
// exercises the actual dynamic import() call rather than an injected mock.
export default {
  server: { port: 3000, host: 'localhost' },
  auth: { trustedOrigins: ['http://localhost:3000'] },
  inertia: { ssr: true },
  database: { provider: 'postgresql' },
}