/**
 * Template content tests — reads the actual files from packages/cli/templates/new/
 * and asserts that each one contains the key content a scaffolded project needs.
 *
 * These are the only tests that catch a broken template file. The mocked unit
 * tests in generate-files.test.ts verify substitution and I/O orchestration,
 * but they never touch the real files.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { TEMPLATE_FILES } from '../../../src/commands/new/generate-files.js'

const TEMPLATES_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../templates/new',
)

function read(src: string): string {
  return readFileSync(join(TEMPLATES_DIR, src), 'utf-8')
}

// ── All templates exist and are non-empty ─────────────────────────────────────

describe('all templates exist', () => {
  for (const { src } of TEMPLATE_FILES) {
    it(`templates/new/${src} exists and is non-empty`, () => {
      const content = read(src)
      expect(content.length).toBeGreaterThan(0)
    })
  }
})

// ── package.json ──────────────────────────────────────────────────────────────

describe('package.json template', () => {
  it('is valid JSON', () => {
    expect(() => JSON.parse(read('package.json'))).not.toThrow()
  })

  it('has "type": "module"', () => {
    expect(JSON.parse(read('package.json')).type).toBe('module')
  })

  it('contains the {{PROJECT_NAME}} placeholder', () => {
    expect(read('package.json')).toContain('{{PROJECT_NAME}}')
  })

  it('lists @hypersonic-js/complete as a dependency', () => {
    const pkg = JSON.parse(read('package.json'))
    expect(pkg.dependencies).toHaveProperty('@hypersonic-js/complete')
  })

  it('lists @hypersonic-js/cli as a devDependency', () => {
    const pkg = JSON.parse(read('package.json'))
    expect(pkg.devDependencies).toHaveProperty('@hypersonic-js/cli')
  })

  it('has a dev script using --experimental-strip-types', () => {
    const pkg = JSON.parse(read('package.json'))
    expect(pkg.scripts.dev).toContain('--experimental-strip-types')
  })

  it('has a build script', () => {
    expect(JSON.parse(read('package.json')).scripts.build).toBeTruthy()
  })

  it('has a lint script', () => {
    expect(JSON.parse(read('package.json')).scripts.lint).toBeTruthy()
  })

  it('has a db:migrate script', () => {
    expect(JSON.parse(read('package.json')).scripts['db:migrate']).toBeTruthy()
  })

  it('lists SQLite adapter as a dependency', () => {
    const pkg = JSON.parse(read('package.json'))
    expect(pkg.dependencies).toHaveProperty('@prisma/adapter-better-sqlite3')
  })

  it('lists prisma as a devDependency', () => {
    const pkg = JSON.parse(read('package.json'))
    expect(pkg.devDependencies).toHaveProperty('prisma')
  })
})

// ── hypersonic.config.ts ──────────────────────────────────────────────────────

describe('hypersonic.config.ts template', () => {
  it('imports defineConfig from @hypersonic-js/complete', () => {
    expect(read('hypersonic.config.ts')).toContain(
      "from '@hypersonic-js/complete'",
    )
  })

  it('calls defineConfig', () => {
    expect(read('hypersonic.config.ts')).toContain('defineConfig(')
  })

  it('sets database provider to sqlite', () => {
    expect(read('hypersonic.config.ts')).toContain("provider: 'sqlite'")
  })

  it('sets ssr to false', () => {
    expect(read('hypersonic.config.ts')).toContain('ssr: false')
  })

  it('has a server block with port and host', () => {
    const content = read('hypersonic.config.ts')
    expect(content).toContain('port:')
    expect(content).toContain('host:')
  })
})

// ── _env (written as .env) ────────────────────────────────────────────────────

describe('_env template', () => {
  it('contains DATABASE_URL pointing at a SQLite file', () => {
    const content = read('_env')
    expect(content).toContain('DATABASE_URL')
    expect(content).toContain('file:')
  })

  it('contains the {{SECRET}} placeholder', () => {
    expect(read('_env')).toContain('{{SECRET}}')
  })

  it('contains BETTER_AUTH_SECRET key', () => {
    expect(read('_env')).toContain('BETTER_AUTH_SECRET')
  })

  it('does not contain a hardcoded secret value', () => {
    // The only value should be the placeholder, not a real secret
    const content = read('_env')
    expect(content).not.toMatch(/BETTER_AUTH_SECRET="[a-f0-9]{32,}"/)
  })
})

// ── .env.example ──────────────────────────────────────────────────────────────

describe('.env.example template', () => {
  it('contains DATABASE_URL', () => {
    expect(read('.env.example')).toContain('DATABASE_URL')
  })

  it('contains BETTER_AUTH_SECRET', () => {
    expect(read('.env.example')).toContain('BETTER_AUTH_SECRET')
  })

  it('does not contain the {{SECRET}} placeholder', () => {
    expect(read('.env.example')).not.toContain('{{SECRET}}')
  })
})

// ── .gitignore ────────────────────────────────────────────────────────────────

describe('.gitignore template', () => {
  it('ignores node_modules/', () => {
    expect(read('.gitignore')).toContain('node_modules/')
  })

  it('ignores .env', () => {
    expect(read('.gitignore')).toContain('.env')
  })

  it('ignores SQLite database files', () => {
    expect(read('.gitignore')).toContain('.db')
  })

  it('ignores the Vite build output directory', () => {
    expect(read('.gitignore')).toContain('public/')
  })
})

// ── tsconfig.json ─────────────────────────────────────────────────────────────

describe('tsconfig.json template', () => {
  it('is valid JSON', () => {
    expect(() => JSON.parse(read('tsconfig.json'))).not.toThrow()
  })

  it('sets jsx to react-jsx', () => {
    expect(JSON.parse(read('tsconfig.json')).compilerOptions.jsx).toBe('react-jsx')
  })

  it('enables strict mode', () => {
    expect(JSON.parse(read('tsconfig.json')).compilerOptions.strict).toBe(true)
  })

  it('sets moduleResolution to bundler', () => {
    expect(
      JSON.parse(read('tsconfig.json')).compilerOptions.moduleResolution,
    ).toBe('bundler')
  })

  it('excludes node_modules and public from compilation', () => {
    const exclude = JSON.parse(read('tsconfig.json')).exclude as string[]
    expect(exclude).toContain('node_modules')
    expect(exclude).toContain('public')
  })
})

// ── eslint.config.js ──────────────────────────────────────────────────────────

describe('eslint.config.js template', () => {
  it('imports typescript-eslint', () => {
    expect(read('eslint.config.js')).toContain('typescript-eslint')
  })

  it('imports eslint-plugin-react-hooks', () => {
    expect(read('eslint.config.js')).toContain('eslint-plugin-react-hooks')
  })

  it('imports eslint-plugin-react-refresh', () => {
    expect(read('eslint.config.js')).toContain('eslint-plugin-react-refresh')
  })

  it('ignores the public build output directory', () => {
    expect(read('eslint.config.js')).toContain("'public/'")
  })

  it('targets ts and tsx files', () => {
    expect(read('eslint.config.js')).toContain('**/*.{ts,tsx}')
  })
})

// ── vite.config.ts ────────────────────────────────────────────────────────────

describe('vite.config.ts template', () => {
  it('imports @vitejs/plugin-react', () => {
    expect(read('vite.config.ts')).toContain("from '@vitejs/plugin-react'")
  })

  it('imports @tailwindcss/vite', () => {
    expect(read('vite.config.ts')).toContain("from '@tailwindcss/vite'")
  })

  it('sets outDir to public', () => {
    expect(read('vite.config.ts')).toContain("outDir: 'public'")
  })

  it('enables the Vite manifest', () => {
    expect(read('vite.config.ts')).toContain('manifest: true')
  })

  it('sets the entry point to resources/js/app.tsx', () => {
    expect(read('vite.config.ts')).toContain('resources/js/app.tsx')
  })
})

// ── prisma/schema.prisma ──────────────────────────────────────────────────────

describe('prisma/schema.prisma template', () => {
  it('sets provider to sqlite', () => {
    expect(read('prisma/schema.prisma')).toContain('provider = "sqlite"')
  })

  it('reads DATABASE_URL from the environment', () => {
    expect(read('prisma/schema.prisma')).toContain('env("DATABASE_URL")')
  })

  it('defines the User model', () => {
    expect(read('prisma/schema.prisma')).toContain('model User {')
  })

  it('defines the Session model', () => {
    expect(read('prisma/schema.prisma')).toContain('model Session {')
  })

  it('defines the Account model', () => {
    expect(read('prisma/schema.prisma')).toContain('model Account {')
  })

  it('defines the Verification model', () => {
    expect(read('prisma/schema.prisma')).toContain('model Verification {')
  })

  it('User model has email unique constraint', () => {
    expect(read('prisma/schema.prisma')).toContain('@unique')
  })

  it('Session model cascades delete from User', () => {
    expect(read('prisma/schema.prisma')).toContain('onDelete: Cascade')
  })
})

// ── prisma.config.ts ──────────────────────────────────────────────────────────

describe('prisma.config.ts template', () => {
  it('imports defineConfig from prisma/config', () => {
    expect(read('prisma.config.ts')).toContain("from 'prisma/config'")
  })

  it('references schema.prisma', () => {
    expect(read('prisma.config.ts')).toContain('schema.prisma')
  })

  it('reads DATABASE_URL from process.env', () => {
    expect(read('prisma.config.ts')).toContain('DATABASE_URL')
  })

  it('loads dotenv/config', () => {
    expect(read('prisma.config.ts')).toContain("'dotenv/config'")
  })
})

// ── server.ts ─────────────────────────────────────────────────────────────────

describe('server.ts template', () => {
  it('imports createApp from @hypersonic-js/complete', () => {
    expect(read('server.ts')).toContain('createApp')
    expect(read('server.ts')).toContain("'@hypersonic-js/complete'")
  })

  it('imports loadConfig', () => {
    expect(read('server.ts')).toContain('loadConfig')
  })

  it('imports createDatabaseAdapter', () => {
    expect(read('server.ts')).toContain('createDatabaseAdapter')
  })

  it('imports mountAdmin', () => {
    expect(read('server.ts')).toContain('mountAdmin')
  })

  it('imports createInertiaErrorHandler', () => {
    expect(read('server.ts')).toContain('createInertiaErrorHandler')
  })

  it('loads PrismaClient via createRequire', () => {
    const content = read('server.ts')
    expect(content).toContain('createRequire')
    expect(content).toContain('@prisma/client')
  })

  it('loads admin-meta.json via createRequire', () => {
    expect(read('server.ts')).toContain('admin-meta.json')
  })

  it('renders the Welcome inertia page', () => {
    expect(read('server.ts')).toContain("'Welcome'")
  })

  it('mounts the admin dashboard', () => {
    expect(read('server.ts')).toContain('mountAdmin(')
  })

  it('mounts the Inertia error handler', () => {
    expect(read('server.ts')).toContain('createInertiaErrorHandler()')
  })

  it('calls app.start()', () => {
    expect(read('server.ts')).toContain('app.start()')
  })
})

// ── resources/css/app.css ─────────────────────────────────────────────────────

describe('resources/css/app.css template', () => {
  it('imports tailwindcss', () => {
    expect(read('resources/css/app.css')).toContain('@import "tailwindcss"')
  })
})

// ── resources/js/app.tsx ──────────────────────────────────────────────────────

describe('resources/js/app.tsx template', () => {
  it('imports createInertiaApp', () => {
    expect(read('resources/js/app.tsx')).toContain('createInertiaApp')
  })

  it('imports createRoot from react-dom/client', () => {
    expect(read('resources/js/app.tsx')).toContain('createRoot')
    expect(read('resources/js/app.tsx')).toContain('react-dom/client')
  })

  it('imports the CSS file', () => {
    expect(read('resources/js/app.tsx')).toContain('app.css')
  })

  it('uses import.meta.glob to resolve pages', () => {
    expect(read('resources/js/app.tsx')).toContain('import.meta.glob')
  })

  it('throws a descriptive error for missing pages', () => {
    expect(read('resources/js/app.tsx')).toContain('Inertia page not found')
  })

  it('mounts the app with createRoot', () => {
    expect(read('resources/js/app.tsx')).toContain('createRoot(el).render')
  })
})

// ── resources/js/Pages/Welcome.tsx ───────────────────────────────────────────

describe('resources/js/Pages/Welcome.tsx template', () => {
  it('exports a default function named Welcome', () => {
    expect(read('resources/js/Pages/Welcome.tsx')).toContain(
      'export default function Welcome',
    )
  })

  it('accepts a routes prop', () => {
    expect(read('resources/js/Pages/Welcome.tsx')).toContain('routes: Route[]')
  })

  it('defines a Route interface with path and description', () => {
    const content = read('resources/js/Pages/Welcome.tsx')
    expect(content).toContain('path: string')
    expect(content).toContain('description: string')
  })

  it('renders routes with map', () => {
    expect(read('resources/js/Pages/Welcome.tsx')).toContain('routes.map(')
  })

  it('links to the documentation site', () => {
    expect(read('resources/js/Pages/Welcome.tsx')).toContain('hypersonic-js.com')
  })

  it('uses Tailwind CSS classes', () => {
    expect(read('resources/js/Pages/Welcome.tsx')).toContain('className=')
  })
})