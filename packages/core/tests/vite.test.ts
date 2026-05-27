import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockMiddlewares = vi.fn()
const mockCreateServer = vi.fn(async () => ({ middlewares: mockMiddlewares }))
const mockExpressStatic = vi.fn(() => vi.fn())
const mockReadFileSync = vi.fn()

vi.mock('vite', () => ({ createServer: mockCreateServer }))
vi.mock('node:fs', () => ({ readFileSync: mockReadFileSync }))
vi.mock('express', async (importOriginal) => {
  const original = await importOriginal<typeof import('express')>()
  return { ...original, default: Object.assign(original.default, { static: mockExpressStatic }) }
})

// Import AFTER mocks are registered
const { createViteSetup } = await import('../src/inertia/vite.js')

describe('createViteSetup — development mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env['NODE_ENV'] = 'development'
  })

  it('calls vite createServer with middlewareMode and custom appType', async () => {
    await createViteSetup(false)
    expect(mockCreateServer).toHaveBeenCalledWith(
      expect.objectContaining({
        server: { middlewareMode: true },
        appType: 'custom',
      }),
    )
  })

  it('returns the vite server middlewares', async () => {
    const setup = await createViteSetup(false)
    expect(setup.middleware).toBe(mockMiddlewares)
  })

  it('assetTags returns the Vite client and app entry script tags', async () => {
    const setup = await createViteSetup(false)
    const tags = setup.assetTags()
    expect(tags).toContain('/@vite/client')
    expect(tags).toContain('/resources/js/app.tsx')
  })

  it('passes ssr=true through to vite setup', async () => {
    await createViteSetup(true)
    expect(mockCreateServer).toHaveBeenCalledOnce()
  })
})

describe('createViteSetup — production mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env['NODE_ENV'] = 'production'
  })

  it('reads the Vite manifest in production', async () => {
    const manifest = {
      'resources/js/app.tsx': { file: 'assets/app-abc123.js', css: ['assets/app-abc123.css'] },
    }
    mockReadFileSync.mockReturnValue(JSON.stringify(manifest))
    await createViteSetup(false)
    expect(mockReadFileSync).toHaveBeenCalledWith('public/.vite/manifest.json', 'utf-8')
  })

  it('assetTags includes the hashed JS file from the manifest', async () => {
    const manifest = {
      'resources/js/app.tsx': { file: 'assets/app-abc123.js', css: [] },
    }
    mockReadFileSync.mockReturnValue(JSON.stringify(manifest))
    const setup = await createViteSetup(false)
    expect(setup.assetTags()).toContain('assets/app-abc123.js')
  })

  it('assetTags includes CSS link tags from the manifest', async () => {
    const manifest = {
      'resources/js/app.tsx': { file: 'assets/app.js', css: ['assets/app.css'] },
    }
    mockReadFileSync.mockReturnValue(JSON.stringify(manifest))
    const setup = await createViteSetup(false)
    expect(setup.assetTags()).toContain('assets/app.css')
  })

  it('returns empty asset tags when manifest is not found', async () => {
    mockReadFileSync.mockImplementation(() => { throw new Error('ENOENT') })
    const setup = await createViteSetup(false)
    expect(setup.assetTags()).toBe('')
  })

  it('returns empty asset tags when manifest entry is missing', async () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({}))
    const setup = await createViteSetup(false)
    expect(setup.assetTags()).toBe('')
  })
})
