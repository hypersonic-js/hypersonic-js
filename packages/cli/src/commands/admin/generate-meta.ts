import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Command } from 'commander'
import { parseDmmf } from '../../dmmf/parser.js'
import { logger } from '../../utils/logger.js'
import type { DmmfDocument } from '../../dmmf/types.js'

export interface GenerateMetaDeps {
  getDMMF: (opts: { datamodel: string }) => unknown
  readFile: (path: string) => string
  writeFile: (path: string, content: string) => void
}

async function loadDeps(): Promise<GenerateMetaDeps> {
  const { getDMMF } = await import('@prisma/get-dmmf')
  return {
    getDMMF,
    readFile: (p) => readFileSync(p, 'utf-8'),
    writeFile: (p, c) => writeFileSync(p, c),
  }
}

export async function runGenerateMeta(
  opts: { schema: string; output: string },
  deps?: GenerateMetaDeps,
): Promise<void> {
  const { getDMMF, readFile, writeFile } = deps ?? (await loadDeps())
  const schema = readFile(resolve(opts.schema))
  const dmmf = await getDMMF({ datamodel: schema })
  const models = parseDmmf(dmmf as DmmfDocument)
  writeFile(resolve(opts.output), JSON.stringify(models, null, 2))
}

export function registerGenerateMeta(adminCmd: Command, deps?: GenerateMetaDeps): void {
  adminCmd
    .command('generate-meta')
    .description(
      'Generate prisma/admin-meta.json from your Prisma schema. ' +
        'Commit this file to your repo — it is the static metadata the admin dashboard reads at runtime.',
    )
    .option('--schema <path>', 'Path to Prisma schema file', 'prisma/schema.prisma')
    .option('--output <path>', 'Output path for the generated meta file', 'prisma/admin-meta.json')
    .action(async (options: { schema: string; output: string }) => {
      try {
        logger.info(`Reading schema from ${options.schema}…`)
        await runGenerateMeta(options, deps)
        logger.success(`Admin meta written to ${options.output}`)
      } catch (err) {
        logger.error(err instanceof Error ? err.message : String(err))
        process.exit(1)
      }
    })
}