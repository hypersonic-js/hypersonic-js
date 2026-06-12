import { cpSync } from 'node:fs'

cpSync('templates', 'dist/templates', { recursive: true })