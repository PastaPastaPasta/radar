import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const web = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'web')
const locales = join(web, 'src', 'i18n', 'locales')
const require = createRequire(join(web, 'package.json'))

function shippedLocales() {
  const source = readFileSync(join(web, 'src', 'i18n', 'locales.ts'), 'utf8')
  return [...source.matchAll(/\{ code: '([^']+)'/g)].map((m) => m[1])
}

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

/** The variables and tags a message uses; a translation must use exactly the same ones. */
function placeholders(text) {
  const names = [...text.matchAll(/\{\s*(\w+)\s*[,}]/g)].map((m) => m[1])
  const tags = [...text.matchAll(/<\/?(\d+)\s*\/?>/g)].map((m) => m[0])
  return [...new Set(names), ...new Set(tags)].sort().join(' ')
}

function listIds(ids, limit = 10) {
  const lines = ids.slice(0, limit).map((id) => `    ${id}`)
  if (ids.length > limit) lines.push(`    … and ${ids.length - limit} more`)
  return lines
}

const shipped = shippedLocales()
const problems = []

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
  console.error('Run `pnpm i18n:extract`, translate what is new, and commit the result.')
  process.exit(1)
}

for (const code of shipped) if (!after.has(code)) problems.push(`${code}: no catalog`)
for (const code of after.keys()) {
  if (!shipped.includes(code)) problems.push(`${code}: a catalog for a locale that is not listed`)
}

const { formatter } = require('@lingui/format-po')
const po = formatter({ lineNumbers: false, origins: false })
const parse = (code) =>
  po.parse(after.get(code) ?? '', { locale: code, sourceLocale: 'en', filename: `${code}.po` })

const english = after.has('en') ? parse('en') : {}
for (const code of shipped) {
  if (!after.has(code)) continue
  const text = after.get(code)
  if (/^#~ /m.test(text)) problems.push(`${code}: obsolete messages`)
  const catalog = parse(code)
  const missing = []
  const broken = []
  for (const [id, entry] of Object.entries(english)) {
    const translation = catalog[id]?.translation
    if (!translation || translation.trim() === '') {
      missing.push(id)
    } else if (placeholders(translation) !== placeholders(entry.message ?? id)) {
      broken.push(id)
    } else if (catalog[id]?.extra?.flags?.includes('fuzzy')) {
      missing.push(id)
    }
  }
  if (missing.length > 0) {
    problems.push(`${code}: ${missing.length} message(s) missing a translation`)
    problems.push(...listIds(missing))
  }
  if (broken.length > 0) {
    problems.push(`${code}: ${broken.length} translation(s) whose placeholders differ`)
    problems.push(...listIds(broken))
  }
}

if (problems.length > 0) {
  console.error('Message catalogs are incomplete:')
  for (const line of problems) console.error(`  ${line}`)
  process.exit(1)
}
console.log(`Message catalogs are up to date in ${shipped.length} locales.`)
