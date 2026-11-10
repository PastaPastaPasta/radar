#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const FORBIDDEN_FILES = ['mockServiceWorker.js']
const FORBIDDEN_TEXT = [
  ['[radar-fixtures]', 'the MSW fixture worker'],
  ['Radar design system', 'the /__kit page'],
]

export function findDevOnlyCode(distDir) {
  const found = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (FORBIDDEN_FILES.includes(entry.name)) found.push(`${full}: fixture service worker`)
      else if (/\.(?:[cm]?js|html)$/.test(entry.name)) {
        const text = readFileSync(full, 'utf8')
        for (const [needle, what] of FORBIDDEN_TEXT) {
          if (text.includes(needle)) found.push(`${full}: ${what}`)
        }
      }
    }
  }
  walk(distDir)
  return found
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const distDir = resolve(process.argv[2] ?? 'apps/web/dist')
  if (!existsSync(distDir)) {
    console.error(`no build in ${distDir}`)
    process.exit(1)
  }
  const found = findDevOnlyCode(distDir)
  if (found.length > 0) {
    console.error('development-only code in the production build:')
    for (const f of found) console.error(`  ${f}`)
    process.exit(1)
  }
  console.log(`${distDir} has no fixture or kit code`)
}
