import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ScaffoldOptions, ScaffoldResult } from '../types.js'

const TEMPLATES_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../templates')

const SCAFFOLD_FILES = ['Dashboard.tsx', 'ModelIndex.tsx', 'ModelForm.tsx'] as const

/**
 * Copies the three generic admin page components into the user's project.
 * These components are schema-driven and stay in sync with Prisma model changes
 * automatically — no regeneration needed after schema updates.
 *
 * @example
 * ```ts
 * import { scaffoldAdmin } from '@hypersonic-js/admin'
 * await scaffoldAdmin({ targetDir: 'resources/js/Pages', force: false })
 * ```
 */
export async function scaffoldAdmin(options: ScaffoldOptions = {}): Promise<ScaffoldResult> {
  const { targetDir = 'resources/js/Pages', force = false } = options
  const adminDir = join(targetDir, 'Admin')

  mkdirSync(adminDir, { recursive: true })

  const written: string[] = []
  const skipped: string[] = []

  for (const name of SCAFFOLD_FILES) {
    const filePath = join(adminDir, name)

    if (existsSync(filePath) && !force) {
      skipped.push(name)
      continue
    }

    const content = readFileSync(join(TEMPLATES_DIR, name), 'utf-8')
    writeFileSync(filePath, content, 'utf-8')
    written.push(name)
  }

  return { written, skipped }
}