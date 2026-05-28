import { defineConfig } from 'vitest/config'

export default defineConfig({
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
  },
})