import { defineConfig } from 'vitest/config'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [tailwindcss()],
  build: {
    outDir: 'public',
    manifest: true,
    rollupOptions: {
      input: 'resources/js/app.tsx',
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // NODE_ENV=production tells createViteSetup to skip the Vite dev server and
    // use the static file handler instead. Without this, createApp() would spin
    // up a full Vite dev server inside every test file.
    env: {
      NODE_ENV: 'production',
    },
    // Run test files sequentially in a single worker so they share the same
    // Postgres instance without racing on DB state.
    // Vitest 4: singleFork was replaced by maxWorkers: 1 + isolate: false
    pool: 'forks',
    maxWorkers: 1,
    isolate: false,
  },
})