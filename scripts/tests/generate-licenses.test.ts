import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock setup (hoisted by vitest before any imports) ─────────────────────────

const mockExecSync = vi.fn()
const mockExistsSync = vi.fn()
const mockReaddirSync = vi.fn()
const mockReadFileSync = vi.fn()
const mockWriteFileSync = vi.fn()

vi.mock('node:child_process', () => ({ execSync: mockExecSync }))
vi.mock('node:fs', () => ({
  existsSync: mockExistsSync,
  readdirSync: mockReaddirSync,
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
}))

// Import AFTER mocks are registered
const {
  runPnpmLicenses,
  readLicenseFile,
  resolveCopyright,
  buildGroups,
  buildMarkdown,
  generateLicenses,
} = await import('../generate-licenses.js')

import type { PnpmLicenseEntry, PnpmLicensesOutput, LicenseGroup } from '../generate-licenses.js'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MIT_TEXT = 'MIT License\nCopyright (c) 2024 Test Author\nPermission is hereby granted...'
const APACHE_TEXT = 'Apache License\nVersion 2.0, January 2004'

function makeEntry(overrides: Partial<PnpmLicenseEntry> = {}): PnpmLicenseEntry {
  return {
    name: 'test-pkg',
    versions: ['1.0.0'],
    paths: ['/node_modules/test-pkg'],
    license: 'MIT',
    ...overrides,
  }
}

function makePnpmOutput(overrides: Partial<PnpmLicensesOutput> = {}): PnpmLicensesOutput {
  return {
    MIT: [
      makeEntry({ name: 'zebra-pkg', author: 'Zebra Corp', homepage: 'https://zebra.dev' }),
      makeEntry({ name: 'alpha-pkg', author: 'Alpha Corp', homepage: 'https://alpha.dev' }),
    ],
    'Apache-2.0': [
      makeEntry({ name: 'apache-pkg', license: 'Apache-2.0', author: 'Apache Author', homepage: 'https://apache.dev' }),
    ],
    ...overrides,
  }
}

// ── runPnpmLicenses ───────────────────────────────────────────────────────────

describe('runPnpmLicenses', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls execSync with the correct pnpm command', () => {
    mockExecSync.mockReturnValue('{}')
    runPnpmLicenses('/repo')
    expect(mockExecSync).toHaveBeenCalledWith(
      'pnpm licenses list --json --long',
      { cwd: '/repo', encoding: 'utf-8' },
    )
  })

  it('parses and returns the JSON output', () => {
    const output: PnpmLicensesOutput = { MIT: [makeEntry()] }
    mockExecSync.mockReturnValue(JSON.stringify(output))
    expect(runPnpmLicenses('/repo')).toEqual(output)
  })
})

// ── readLicenseFile ───────────────────────────────────────────────────────────

describe('readLicenseFile', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns null when the package path does not exist', () => {
    mockExistsSync.mockReturnValue(false)
    expect(readLicenseFile('/missing')).toBeNull()
  })

  it('returns null when no LICENSE file is present', () => {
    mockExistsSync.mockReturnValue(true)
    mockReaddirSync.mockReturnValue(['index.js', 'package.json'])
    expect(readLicenseFile('/pkg')).toBeNull()
  })

  it('finds and reads a plain LICENSE file', () => {
    mockExistsSync.mockReturnValue(true)
    mockReaddirSync.mockReturnValue(['LICENSE', 'index.js'])
    mockReadFileSync.mockReturnValue('  MIT License  ')
    expect(readLicenseFile('/pkg')).toBe('MIT License')
  })

  it('finds LICENSE.md', () => {
    mockExistsSync.mockReturnValue(true)
    mockReaddirSync.mockReturnValue(['LICENSE.md'])
    mockReadFileSync.mockReturnValue('MIT License')
    expect(readLicenseFile('/pkg')).toBe('MIT License')
  })

  it('finds LICENSE.txt', () => {
    mockExistsSync.mockReturnValue(true)
    mockReaddirSync.mockReturnValue(['LICENSE.txt'])
    mockReadFileSync.mockReturnValue('MIT License')
    expect(readLicenseFile('/pkg')).toBe('MIT License')
  })

  it('finds LICENCE (British spelling)', () => {
    mockExistsSync.mockReturnValue(true)
    mockReaddirSync.mockReturnValue(['LICENCE'])
    mockReadFileSync.mockReturnValue('MIT License')
    expect(readLicenseFile('/pkg')).toBe('MIT License')
  })

  it('finds licence.md (lowercase)', () => {
    mockExistsSync.mockReturnValue(true)
    mockReaddirSync.mockReturnValue(['licence.md'])
    mockReadFileSync.mockReturnValue('MIT License')
    expect(readLicenseFile('/pkg')).toBe('MIT License')
  })

  it('returns trimmed content', () => {
    mockExistsSync.mockReturnValue(true)
    mockReaddirSync.mockReturnValue(['LICENSE'])
    mockReadFileSync.mockReturnValue('\n\n  MIT License  \n\n')
    expect(readLicenseFile('/pkg')).toBe('MIT License')
  })
})

// ── resolveCopyright ──────────────────────────────────────────────────────────

describe('resolveCopyright', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns the author field when present', () => {
    const entry = makeEntry({ author: 'TJ Holowaychuk' })
    expect(resolveCopyright(entry, '/any')).toBe('TJ Holowaychuk')
  })

  it('does not read the LICENSE file when author is present', () => {
    const entry = makeEntry({ author: 'TJ Holowaychuk' })
    resolveCopyright(entry, '/any')
    expect(mockExistsSync).not.toHaveBeenCalled()
  })

  it('falls back to LICENSE file copyright line when author is absent', () => {
    const entry = makeEntry({ author: undefined })
    mockExistsSync.mockReturnValue(true)
    mockReaddirSync.mockReturnValue(['LICENSE'])
    mockReadFileSync.mockReturnValue(MIT_TEXT)
    expect(resolveCopyright(entry, '/pkg')).toBe('Copyright (c) 2024 Test Author')
  })

  it('returns Unknown when author is absent and no dated copyright line exists', () => {
    const entry = makeEntry({ author: undefined })
    mockExistsSync.mockReturnValue(true)
    mockReaddirSync.mockReturnValue(['LICENSE'])
    mockReadFileSync.mockReturnValue('Permission is hereby granted...')
    expect(resolveCopyright(entry, '/pkg')).toBe('Unknown')
  })

  it('returns Unknown when author is absent and no LICENSE file exists', () => {
    const entry = makeEntry({ author: undefined })
    mockExistsSync.mockReturnValue(false)
    expect(resolveCopyright(entry, '/pkg')).toBe('Unknown')
  })

  it('matches copyright with © symbol', () => {
    const entry = makeEntry({ author: undefined })
    mockExistsSync.mockReturnValue(true)
    mockReaddirSync.mockReturnValue(['LICENSE'])
    mockReadFileSync.mockReturnValue('© 2023 Some Corp')
    expect(resolveCopyright(entry, '/pkg')).toBe('© 2023 Some Corp')
  })
})

// ── buildGroups ───────────────────────────────────────────────────────────────

describe('buildGroups', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExistsSync.mockReturnValue(true)
    mockReaddirSync.mockReturnValue(['LICENSE'])
    mockReadFileSync.mockReturnValue(MIT_TEXT)
  })

  it('produces one group per license type', () => {
    const groups = buildGroups(makePnpmOutput())
    expect(groups).toHaveLength(2)
    expect(groups.map((g) => g.licenseType)).toContain('MIT')
    expect(groups.map((g) => g.licenseType)).toContain('Apache-2.0')
  })

  it('sorts groups alphabetically by license type', () => {
    const groups = buildGroups(makePnpmOutput())
    expect(groups[0]!.licenseType).toBe('Apache-2.0')
    expect(groups[1]!.licenseType).toBe('MIT')
  })

  it('sorts packages alphabetically within a group', () => {
    const groups = buildGroups(makePnpmOutput())
    const mit = groups.find((g) => g.licenseType === 'MIT')!
    expect(mit.packages[0]!.name).toBe('alpha-pkg')
    expect(mit.packages[1]!.name).toBe('zebra-pkg')
  })

  it('includes correct copyright and link on each package', () => {
    const groups = buildGroups(makePnpmOutput())
    const mit = groups.find((g) => g.licenseType === 'MIT')!
    const alpha = mit.packages.find((p) => p.name === 'alpha-pkg')!
    expect(alpha.copyright).toBe('Alpha Corp')
    expect(alpha.link).toBe('https://alpha.dev')
  })

  it('expands multi-version entries into separate package refs', () => {
    const output: PnpmLicensesOutput = {
      MIT: [
        makeEntry({
          name: 'multi-pkg',
          versions: ['1.0.0', '2.0.0'],
          paths: ['/node_modules/multi-pkg-v1', '/node_modules/multi-pkg-v2'],
        }),
      ],
    }
    const groups = buildGroups(output)
    expect(groups[0]!.packages).toHaveLength(2)
    expect(groups[0]!.packages.map((p) => p.version)).toEqual(['1.0.0', '2.0.0'])
  })

  it('sets licenseText from the first package with a LICENSE file', () => {
    mockReadFileSync.mockReturnValue(MIT_TEXT)
    const groups = buildGroups(makePnpmOutput())
    const mit = groups.find((g) => g.licenseType === 'MIT')!
    expect(mit.licenseText).toBe(MIT_TEXT)
  })

  it('sets licenseText to null when no package has a LICENSE file', () => {
    mockExistsSync.mockReturnValue(false)
    const groups = buildGroups(makePnpmOutput())
    expect(groups[0]!.licenseText).toBeNull()
  })
})

// ── buildMarkdown ─────────────────────────────────────────────────────────────

describe('buildMarkdown', () => {
  const groups: LicenseGroup[] = [
    {
      licenseType: 'MIT',
      packages: [
        { name: 'express', version: '5.0.0', copyright: 'TJ Holowaychuk', link: 'https://expressjs.com/' },
        { name: 'zod', version: '4.0.0', copyright: 'Unknown', link: '' },
      ],
      licenseText: MIT_TEXT,
    },
    {
      licenseType: 'Apache-2.0',
      packages: [
        { name: 'typescript', version: '6.0.0', copyright: 'Microsoft Corp.', link: 'https://typescriptlang.org/' },
      ],
      licenseText: null,
    },
  ]

  it('includes the main heading', () => {
    expect(buildMarkdown(groups, '2026-01-01')).toContain('# Third-Party Licenses')
  })

  it('includes the generated date', () => {
    expect(buildMarkdown(groups, '2026-01-01')).toContain('_Generated: 2026-01-01_')
  })

  it('includes total package and license type counts in the summary', () => {
    const md = buildMarkdown(groups, '2026-01-01')
    expect(md).toContain('3 packages across 2 license types')
  })

  it('renders a section heading per license type', () => {
    const md = buildMarkdown(groups, '2026-01-01')
    expect(md).toContain('## MIT')
    expect(md).toContain('## Apache-2.0')
  })

  it('renders package count in the packages sub-heading', () => {
    expect(buildMarkdown(groups, '2026-01-01')).toContain('### Packages (2)')
  })

  it('renders package name, copyright, and link on one line', () => {
    const md = buildMarkdown(groups, '2026-01-01')
    expect(md).toContain('- **express@5.0.0** — TJ Holowaychuk — https://expressjs.com/')
  })

  it('omits the copyright segment when copyright is Unknown', () => {
    const md = buildMarkdown(groups, '2026-01-01')
    expect(md).toContain('- **zod@4.0.0**\n')
  })

  it('omits the link segment when link is empty', () => {
    const md = buildMarkdown(groups, '2026-01-01')
    expect(md).toContain('- **zod@4.0.0**\n')
  })

  it('renders license text in a fenced code block', () => {
    const md = buildMarkdown(groups, '2026-01-01')
    expect(md).toContain('```\n' + MIT_TEXT + '\n```')
  })

  it('renders fallback message when licenseText is null', () => {
    const md = buildMarkdown(groups, '2026-01-01')
    expect(md).toContain('_License text not found in package distribution._')
  })
})

// ── generateLicenses ──────────────────────────────────────────────────────────

describe('generateLicenses', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExecSync.mockReturnValue(JSON.stringify(makePnpmOutput()))
    mockExistsSync.mockReturnValue(true)
    mockReaddirSync.mockReturnValue(['LICENSE'])
    mockReadFileSync.mockReturnValue(MIT_TEXT)
  })

  it('writes THIRD_PARTY_LICENSES.md to the given cwd', () => {
    generateLicenses('/repo')
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining('THIRD_PARTY_LICENSES.md'),
      expect.any(String),
      'utf-8',
    )
  })

  it('writes valid markdown content', () => {
    generateLicenses('/repo')
    const [, content] = mockWriteFileSync.mock.calls[0] as [string, string, string]
    expect(content).toContain('# Third-Party Licenses')
  })

  it('logs a success message with package and license type counts', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    generateLicenses('/repo')
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('THIRD_PARTY_LICENSES.md written'))
    spy.mockRestore()
  })
})