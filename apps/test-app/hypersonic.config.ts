import { defineConfig } from '@hypersonic-js/core'

export default defineConfig({
  server: {
    port: 3000,
    host: 'localhost',
  },
  auth: {
    trustedOrigins: ['http://localhost:3000'],
  },
  inertia: {
    ssr: false,
  },
})