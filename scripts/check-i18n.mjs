import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const web = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'web')
const locales = join(web, 'src', 'i18n', 'locales')

function snapshot() {
  const files = new Map()
  for (const code of readdirSync(locales)) {
    const file = join(locales, code, 'messages.po')
    if (existsSync(file)) files.set(code, readFileSync(file, 'utf8'))
  }
  return files
}

function lingui(...args) {
  return spawnSync('pnpm', ['exec', 'lingui', ...args], { cwd: web, encoding: 'utf8' })
}

const before = snapshot()
const extract = lingui('extract', '--clean')
if (extract.status !== 0) {
  process.stderr.write(extract.stdout + extract.stderr)
  process.exit(extract.status ?? 1)
}
const after = snapshot()

const stale = [...new Set([...before.keys(), ...after.keys()])].filter(
  (code) => before.get(code) !== after.get(code),
)
if (stale.length > 0) {
  console.error(`Message catalogs out of date: ${stale.join(', ')}.`)
  console.error('Run `pnpm i18n:extract` and commit the result.')
  process.exit(1)
}

const english = after.get('en') ?? ''
const untranslated = [...english.matchAll(/^msgid "(.+)"\nmsgstr ""$/gm)].map((m) => m[1])
if (untranslated.length > 0 || /^#~ /m.test(english)) {
  console.error('The English catalog has untranslated or obsolete messages:')
  for (const id of untranslated) console.error(`  ${id}`)
  process.exit(1)
}
console.log('Message catalogs are up to date.')
