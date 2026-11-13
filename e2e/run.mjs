#!/usr/bin/env node
// pnpm forwards a literal `--` through `pnpm e2e:fixtures -- <args>`, and Playwright would take every
// argument after it as a test filter, dropping options such as --shard or --workers. Strip it.
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

const args = process.argv.slice(2)
if (args[0] === '--') args.shift()
const cli = createRequire(import.meta.url).resolve('@playwright/test/cli')
const { status, signal } = spawnSync(process.execPath, [cli, 'test', ...args], { stdio: 'inherit' })
process.exit(signal ? 1 : (status ?? 1))
