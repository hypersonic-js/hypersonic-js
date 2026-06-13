import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// ── Types ──────────────────────────────────────────────────────────────────

export interface GenerateFilesOptions {
  projectDir: string
  projectName: string
  secret: string
}

export interface WrittenFile {
  /** Destination path relative to the project root (e.g. 'prisma/schema.prisma'). */
  dest: string
}

/**
 * Injectable I/O deps so unit tests never touch the real filesystem.
 * templatesDir lets tests point at a fake templates directory.
 */
export interface GenerateFilesDeps {
  readFile: (filePath: string) => string
  mkdir: (dirPath: string) => void
  writeFile: (filePath: string, content: string) => void
  templatesDir: string
}

// ── Template file manifest ─────────────────────────────────────────────────

/**
 * Static list of every file the `new` command writes.
 *
 * `src`  — filename inside templates/new/ (relative, may differ from dest)
 * `dest` — filename written into the project (relative to projectDir)
 *
 * The only src↔dest rename is `_env` → `.env`: the root .gitignore has a bare
 * `.env` pattern that matches files at any depth, so the template is stored
 * under a neutral name and renamed on write.
 */
export const TEMPLATE_FILES = [
  { src: 'package.json',                        dest: 'package.json' },
  { src: 'hypersonic.config.ts',                dest: 'hypersonic.config.ts' },
  { src: '_env',                                dest: '.env' },
  { src: '.env.example',                        dest: '.env.example' },
  { src: '.gitignore',                          dest: '.gitignore' },
  { src: 'tsconfig.json',                       dest: 'tsconfig.json' },
  { src: 'eslint.config.js',                    dest: 'eslint.config.js' },
  { src: 'vite.config.ts',                      dest: 'vite.config.ts' },
  { src: 'prisma/schema.prisma',                dest: 'prisma/schema.prisma' },
  { src: 'prisma.config.ts',                    dest: 'prisma.config.ts' },
  { src: 'server.ts',                           dest: 'server.ts' },
  { src: 'resources/css/app.css',               dest: 'resources/css/app.css' },
  { src: 'resources/js/app.tsx',                dest: 'resources/js/app.tsx' },
  { src: 'resources/js/Pages/Welcome.tsx',      dest: 'resources/js/Pages/Welcome.tsx' },
] as const

// ── Substitution ───────────────────────────────────────────────────────────

/**
 * Replaces every `{{KEY}}` placeholder in `content` with the corresponding
 * value from `vars`. Unknown placeholders are left untouched.
 */
export function applySubstitutions(
  content: string,
  vars: Record<string, string>,
): string {
  return Object.entries(vars).reduce(
    (acc, [key, value]) => acc.replaceAll(`{{${key}}}`, value),
    content,
  )
}

// ── Dependency loader ──────────────────────────────────────────────────────

function loadDeps(): GenerateFilesDeps {
  return {
    readFile: (p) => readFileSync(p, 'utf-8'),
    mkdir: (p) => mkdirSync(p, { recursive: true }),
    writeFile: (p, c) => writeFileSync(p, c, 'utf-8'),
    // Resolves to packages/cli/templates/new/ in the monorepo,
    // and node_modules/@hypersonic-js/cli/templates/new/ when installed.
    templatesDir: join(dirname(fileURLToPath(import.meta.url)), '../../../templates/new'),
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

/**
 * Reads every template file, substitutes project-specific placeholders,
 * and writes the results into `projectDir`.
 *
 * Substitutions applied:
 *   {{PROJECT_NAME}} → projectName
 *   {{SECRET}}       → secret
 */
export async function generateFiles(
  opts: GenerateFilesOptions,
  deps: GenerateFilesDeps = loadDeps(),
): Promise<WrittenFile[]> {
  const { projectDir, projectName, secret } = opts
  const { readFile, mkdir, writeFile, templatesDir } = deps
  const vars = { PROJECT_NAME: projectName, SECRET: secret }
  const written: WrittenFile[] = []

  for (const { src, dest } of TEMPLATE_FILES) {
    const raw = readFile(join(templatesDir, src))
    const content = applySubstitutions(raw, vars)
    const destPath = join(projectDir, dest)

    mkdir(dirname(destPath))
    writeFile(destPath, content)
    written.push({ dest })
  }

  return written
}