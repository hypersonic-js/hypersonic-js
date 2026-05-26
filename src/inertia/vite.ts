import type { RequestHandler } from 'express'
import type { ViteSetup } from './types.js'

const DEV_ASSET_TAGS = [
  '<script type="module" src="/@vite/client"></script>',
  '<script type="module" src="/resources/js/app.tsx"></script>',
].join('\n    ')

async function createDevSetup(): Promise<ViteSetup> {
  const { createServer } = await import('vite')

  const viteServer = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
  })

  return {
    middleware: viteServer.middlewares as unknown as RequestHandler,
    assetTags: () => DEV_ASSET_TAGS,
  }
}

async function createProdSetup(): Promise<ViteSetup> {
  const { readFileSync } = await import('node:fs')
  const { static: expressStatic } = await import('express')

  let tags = ''

  try {
    type ManifestEntry = { file: string; css?: string[] }
    const raw = readFileSync('public/.vite/manifest.json', 'utf-8')
    const manifest = JSON.parse(raw) as Record<string, ManifestEntry>
    const entry = manifest['resources/js/app.tsx']

    if (entry !== undefined) {
      const cssLinks =
        entry.css
          ?.map((c) => `<link rel="stylesheet" href="/${c}" />`)
          .join('\n    ') ?? ''
      tags = `${cssLinks}\n    <script type="module" src="/${entry.file}"></script>`
    }
  } catch {
    // No manifest found — assets will be missing but the server still boots
  }

  const captured = tags

  return {
    middleware: expressStatic('public') as RequestHandler,
    assetTags: () => captured,
  }
}

/**
 * Returns the correct Vite setup (dev server or static file serving)
 * based on NODE_ENV. Isolated as a named export so tests can mock it.
 */
export async function createViteSetup(_ssr: boolean): Promise<ViteSetup> {
  if (process.env['NODE_ENV'] === 'production') {
    return createProdSetup()
  }
  return createDevSetup()
}
