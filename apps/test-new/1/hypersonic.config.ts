import { defineConfig } from '@hypersonic-js/complete'

export default defineConfig({
  server: {
    port: 3000,
    host: 'localhost',
  },
  database: {
    provider: 'sqlite',
  },
  auth: {
    trustedOrigins: ['http://localhost:3000'],
  },
  inertia: {
    ssr: false,
  },
})
