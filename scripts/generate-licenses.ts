#!/usr/bin/env node
/**
 * Generates THIRD_PARTY_LICENSES.md at the repo root.
 *
 * Uses `pnpm licenses list --json --long` which handles the full monorepo
 * workspace natively — no manual package.json scanning required.
 *
 * The report is deduplicated by license type: one copy of each license text
 * (read from the first package in that group that ships a LICENSE file),
 * with all packages using that license listed beneath it. Each package line
 * includes the copyright holder (from pnpm's `author` field, with a fallback
 * to extracting the copyright line from the package's LICENSE file) and a
 * link (from pnpm's `homepage` field).
 *
 * Note: pnpm's --prod flag does not filter devDependencies when run at the
 * workspace root (it only applies within a single package context). All
 * installed packages are therefore included, which is the safer compliance
 * position — omitting a runtime dependency from a license report is a
 * violation; including extra dev-only tools is not.
 *
 * Run:     pnpm run licenses
 * Or:      node --experimental-strip-types scripts/generate-licenses.ts
 */

import { execSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// ── Types ────────────────────────────────────────────────────────────────────

interface PnpmLicenseEntry {
  name: string
  versions: string[]
  paths: string[]
  license: string
  author?: string
  homepage?: string
  description?: string
}

type PnpmLicensesOutput = Record<string, PnpmLicenseEntry[]>

interface PackageRef {
  name: string
  version: string
  copyright: string
  link: string
}

interface LicenseGroup {
  licenseType: string
  packages: PackageRef[]
  licenseText: string | null
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * execSync goes through the OS shell, which means it finds `pnpm.cmd` on
 * Windows and `pnpm` on Unix without any platform-detection logic.
 */
function runPnpmLicenses(cwd: string): PnpmLicensesOutput {
  const stdout = execSync('pnpm licenses list --json --long', {
    cwd,
    encoding: 'utf-8',
  })
  return JSON.parse(stdout) as PnpmLicensesOutput
}

/**
 * Reads the LICENSE file from a package directory.
 * Checks all common filename variants; returns null if none is found.
 */
function readLicenseFile(pkgPath: string): string | null {
  if (!existsSync(pkgPath)) return null

  const candidate = readdirSync(pkgPath).find((f) =>
    /^licen[sc]e(\.(md|txt))?$/i.test(f),
  )

  return candidate
    ? readFileSync(join(pkgPath, candidate), 'utf-8').trim()
    : null
}

/**
 * Extracts the copyright holder for a package.
 * Prefers pnpm's `author` field (already parsed from package.json).
 * Falls back to finding a dated copyright line in the LICENSE file, e.g.
 * "Copyright (c) 2024 Name" — the year anchor avoids matching the generic
 * "copyright" word that appears in Apache-2.0 boilerplate.
 */
function resolveCopyright(entry: PnpmLicenseEntry, pkgPath: string): string {
  if (entry.author) return entry.author

  const text = readLicenseFile(pkgPath)
  if (text) {
    const match = text.match(/^.*copyright\s+(?:\(c\)|©)?\s*\d{4}.*$/im)
    if (match?.[0]) return match[0].trim()
  }

  return 'Unknown'
}

/**
 * Builds one LicenseGroup per license type.
 * Packages are sorted alphabetically within each group.
 * The license text is taken from the first package in the group that ships
 * a LICENSE file — the boilerplate is identical across packages sharing the
 * same SPDX identifier.
 */
function buildGroups(output: PnpmLicensesOutput): LicenseGroup[] {
  const groups: LicenseGroup[] = []

  for (const [licenseType, entries] of Object.entries(output)) {
    const packages: PackageRef[] = entries
      .flatMap((entry) =>
        entry.versions.map((version, i) => {
          const pkgPath = entry.paths[i] ?? entry.paths[0] ?? ''
          return {
            name: entry.name,
            version,
            copyright: resolveCopyright(entry, pkgPath),
            link: entry.homepage ?? '',
          }
        }),
      )
      .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))

    let licenseText: string | null = null
    for (const entry of entries) {
      const text = readLicenseFile(entry.paths[0] ?? '')
      if (text) {
        licenseText = text
        break
      }
    }

    groups.push({ licenseType, packages, licenseText })
  }

  return groups.sort((a, b) => a.licenseType.localeCompare(b.licenseType))
}

function buildMarkdown(groups: LicenseGroup[], generatedAt: string): string {
  const totalPackages = groups.reduce((n, g) => n + g.packages.length, 0)

  const lines: string[] = [
    '# Third-Party Licenses',
    '',
    'All dependencies used by Hypersonic.js and their respective licenses.',
    `${totalPackages} packages across ${groups.length} license types.`,
    '',
    `_Generated: ${generatedAt}_`,
    '',
    '---',
    '',
  ]

  for (const group of groups) {
    lines.push(`## ${group.licenseType}`)
    lines.push('')
    lines.push(`### Packages (${group.packages.length})`)
    lines.push('')

    for (const pkg of group.packages) {
      const copyright = pkg.copyright !== 'Unknown' ? ` — ${pkg.copyright}` : ''
      const link = pkg.link ? ` — ${pkg.link}` : ''
      lines.push(`- **${pkg.name}@${pkg.version}**${copyright}${link}`)
    }

    lines.push('')
    lines.push('### License Text')
    lines.push('')

    if (group.licenseText) {
      lines.push('```')
      lines.push(group.licenseText)
      lines.push('```')
    } else {
      lines.push('_License text not found in package distribution._')
    }

    lines.push('')
    lines.push('---')
    lines.push('')
  }

  return lines.join('\n')
}

// ── Entry point ──────────────────────────────────────────────────────────────

function generateLicenses(cwd: string): void {
  const raw = runPnpmLicenses(cwd)
  const groups = buildGroups(raw)
  const markdown = buildMarkdown(groups, new Date().toISOString().slice(0, 10))

  writeFileSync(join(cwd, 'THIRD_PARTY_LICENSES.md'), markdown, 'utf-8')

  const totalPackages = groups.reduce((n, g) => n + g.packages.length, 0)
  console.log(
    `✔  THIRD_PARTY_LICENSES.md written` +
    ` (${totalPackages} packages, ${groups.length} license types)`,
  )
}

generateLicenses(process.cwd())