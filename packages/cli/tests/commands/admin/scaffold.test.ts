import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Command } from 'commander'
import { registerAdminScaffold } from '../../../src/commands/admin/scaffold.js'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@hypersonic-js/admin', () => ({
  scaffoldAdmin: vi.fn(),
}))

vi.mock('../../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

import { scaffoldAdmin } from '@hypersonic-js/admin'
import { logger } from '../../../src/utils/logger.js'

const mockScaffoldAdmin = vi.mocked(scaffoldAdmin)
const mockLogger = {
  info: vi.mocked(logger.info),
  success: vi.mocked(logger.success),
  warn: vi.mocked(logger.warn),
  error: vi.mocked(logger.error),
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildAdminCommand(): Command {
  const program = new Command()
  program.exitOverride() // prevent process.exit during tests
  const admin = program.command('admin')
  registerAdminScaffold(admin)
  return program
}

async function runScaffold(args: string[]): Promise<void> {
  const program = buildAdminCommand()
  await program.parseAsync(['node', 'hypersonic', 'admin', 'scaffold', ...args])
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('admin scaffold command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('success — files written', () => {
    beforeEach(() => {
      mockScaffoldAdmin.mockResolvedValue({
        written: ['Dashboard.tsx', 'ModelIndex.tsx', 'ModelForm.tsx'],
        skipped: [],
      })
    })

    it('calls scaffoldAdmin with the default targetDir', async () => {
      await runScaffold([])
      expect(mockScaffoldAdmin).toHaveBeenCalledWith({
        targetDir: 'resources/js/Pages',
        force: false,
      })
    })

    it('calls scaffoldAdmin with a custom --target-dir', async () => {
      await runScaffold(['--target-dir', 'app/Pages'])
      expect(mockScaffoldAdmin).toHaveBeenCalledWith({
        targetDir: 'app/Pages',
        force: false,
      })
    })

    it('passes force: true when --force flag is provided', async () => {
      await runScaffold(['--force'])
      expect(mockScaffoldAdmin).toHaveBeenCalledWith({
        targetDir: 'resources/js/Pages',
        force: true,
      })
    })

    it('passes force: true for the -f shorthand', async () => {
      await runScaffold(['-f'])
      expect(mockScaffoldAdmin).toHaveBeenCalledWith(
        expect.objectContaining({ force: true }),
      )
    })

    it('logs info before scaffolding', async () => {
      await runScaffold([])
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('resources/js/Pages'),
      )
    })

    it('logs success for each written file', async () => {
      await runScaffold([])
      expect(mockLogger.success).toHaveBeenCalledTimes(3)
      expect(mockLogger.success).toHaveBeenCalledWith(
        expect.stringContaining('Dashboard.tsx'),
      )
      expect(mockLogger.success).toHaveBeenCalledWith(
        expect.stringContaining('ModelIndex.tsx'),
      )
      expect(mockLogger.success).toHaveBeenCalledWith(
        expect.stringContaining('ModelForm.tsx'),
      )
    })

    it('does not log any warnings when all files are written', async () => {
      await runScaffold([])
      expect(mockLogger.warn).not.toHaveBeenCalled()
    })
  })

  describe('partial — some files skipped', () => {
    beforeEach(() => {
      mockScaffoldAdmin.mockResolvedValue({
        written: ['ModelIndex.tsx', 'ModelForm.tsx'],
        skipped: ['Dashboard.tsx'],
      })
    })

    it('logs success for written files and warn for skipped files', async () => {
      await runScaffold([])
      expect(mockLogger.success).toHaveBeenCalledTimes(2)
      expect(mockLogger.warn).toHaveBeenCalledTimes(1)
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Dashboard.tsx'),
      )
    })

    it('warn message mentions --force', async () => {
      await runScaffold([])
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('--force'),
      )
    })
  })

  describe('all skipped', () => {
    beforeEach(() => {
      mockScaffoldAdmin.mockResolvedValue({
        written: [],
        skipped: ['Dashboard.tsx', 'ModelIndex.tsx', 'ModelForm.tsx'],
      })
    })

    it('logs a warning for each skipped file', async () => {
      await runScaffold([])
      expect(mockLogger.warn).toHaveBeenCalledTimes(3)
      expect(mockLogger.success).not.toHaveBeenCalled()
    })
  })

  describe('empty result — unexpected edge case', () => {
    beforeEach(() => {
      mockScaffoldAdmin.mockResolvedValue({ written: [], skipped: [] })
    })

    it('logs a warning when neither written nor skipped', async () => {
      await runScaffold([])
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('No files written'),
      )
    })
  })

  describe('error handling', () => {
    it('rejects when scaffoldAdmin throws', async () => {
      mockScaffoldAdmin.mockRejectedValue(new Error('disk full'))
      await expect(runScaffold([])).rejects.toThrow('disk full')
    })
  })

  describe('command structure', () => {
    it('registers scaffold as a subcommand of admin', () => {
      const program = buildAdminCommand()
      const adminCmd = program.commands.find((c) => c.name() === 'admin')
      expect(adminCmd).toBeDefined()
      const scaffoldCmd = adminCmd!.commands.find((c) => c.name() === 'scaffold')
      expect(scaffoldCmd).toBeDefined()
    })

    it('scaffold command has --target-dir option with correct default', () => {
      const program = buildAdminCommand()
      const adminCmd = program.commands.find((c) => c.name() === 'admin')!
      const scaffoldCmd = adminCmd.commands.find((c) => c.name() === 'scaffold')!
      const opt = scaffoldCmd.options.find((o) => o.long === '--target-dir')
      expect(opt).toBeDefined()
      expect(opt!.defaultValue).toBe('resources/js/Pages')
    })

    it('scaffold command has --force / -f option defaulting to false', () => {
      const program = buildAdminCommand()
      const adminCmd = program.commands.find((c) => c.name() === 'admin')!
      const scaffoldCmd = adminCmd.commands.find((c) => c.name() === 'scaffold')!
      const opt = scaffoldCmd.options.find((o) => o.long === '--force')
      expect(opt).toBeDefined()
      expect(opt!.short).toBe('-f')
    })
  })
})
