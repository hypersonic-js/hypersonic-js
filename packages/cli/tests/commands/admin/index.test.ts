import { describe, it, expect } from 'vitest'
import { Command } from 'commander'
import { registerAdminCommands } from '../../../src/commands/admin/index.js'

describe('registerAdminCommands', () => {
  it('attaches an admin command to the program', () => {
    const program = new Command()
    registerAdminCommands(program)
    const admin = program.commands.find((c) => c.name() === 'admin')
    expect(admin).toBeDefined()
  })

  it('admin command has a description', () => {
    const program = new Command()
    registerAdminCommands(program)
    const admin = program.commands.find((c) => c.name() === 'admin')!
    expect(admin.description()).toBeTruthy()
  })

  it('admin command includes the scaffold subcommand', () => {
    const program = new Command()
    registerAdminCommands(program)
    const admin = program.commands.find((c) => c.name() === 'admin')!
    const scaffold = admin.commands.find((c) => c.name() === 'scaffold')
    expect(scaffold).toBeDefined()
  })
})
