import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { ScaffoldOptions, ScaffoldResult } from '../types.js'
import {
  DASHBOARD_TEMPLATE,
  MODEL_INDEX_TEMPLATE,
  MODEL_FORM_TEMPLATE,
} from './templates.js'

const SCAFFOLD_FILES = [
  { name: 'Dashboard.tsx', content: DASHBOARD_TEMPLATE },
  { name: 'ModelIndex.tsx', content: MODEL_INDEX_TEMPLATE },
  { name: 'ModelForm.tsx', content: MODEL_FORM_TEMPLATE },
] as const

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

  for (const file of SCAFFOLD_FILES) {
    const filePath = join(adminDir, file.name)

    if (existsSync(filePath) && !force) {
      skipped.push(file.name)
      continue
    }

    writeFileSync(filePath, file.content, 'utf-8')
    written.push(file.name)
  }

  return { written, skipped }
}
