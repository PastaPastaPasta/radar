import { spawnSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
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

/** Every catalog of every locale, keyed `<locale>/<catalog>.po`: `messages.po` and one per package. */
function snapshot() {
  const files = new Map()
  for (const code of readdirSync(locales)) {
    for (const name of readdirSync(join(locales, code)).filter((f) => f.endsWith('.po'))) {
      files.set(`${code}/${name}`, readFileSync(join(locales, code, name), 'utf8'))
    }
  }
  return files
}

const localeOf = (key) => key.split('/')[0]

function lingui(...args) {
  return spawnSync('pnpm', ['exec', 'lingui', ...args], { cwd: web, encoding: 'utf8' })
}

/** The variables and tags a message uses; a translation must use exactly the same ones. */
function placeholders(text) {
  const names = [...text.matchAll(/\{\s*(\w+)\s*[,}]/g)].map((m) => m[1])
  const tags = [...text.matchAll(/<\/?(\d+)\s*\/?>/g)].map((m) => m[0])
  return [...new Set(names), ...new Set(tags)].sort().join(' ')
}

/** The plural categories a locale needs for whole numbers: ru and uk need few and many, ja and zh only other. */
function requiredPlurals(code) {
  const rules = new Intl.PluralRules(code)
  const categories = new Set(['other'])
  for (let n = 0; n <= 200; n++) categories.add(rules.select(n))
  return categories
}

/** For each plural in a message, the categories it spells out ("one", "few", "=0", ...). */
function pluralBlocks(text) {
  const blocks = []
  for (const match of text.matchAll(/\{\s*\w+\s*,\s*(?:plural|selectordinal)\s*,/g)) {
    const found = new Set()
    let depth = 1
    let word = ''
    for (let i = match.index + match[0].length; i < text.length && depth > 0; i++) {
      const ch = text[i]
      if (ch === '{') {
        if (depth === 1 && word) found.add(word)
        word = ''
        depth++
      } else if (ch === '}') {
        depth--
        word = ''
      } else if (depth === 1) {
        if (!/\s/.test(ch)) word += ch
      }
    }
    blocks.push(found)
  }
  return blocks
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
  (key) => before.get(key) !== after.get(key),
)
if (stale.length > 0) {
  console.error(`Message catalogs out of date: ${stale.join(', ')}.`)
  console.error('Run `pnpm i18n:extract`, translate what is new, and commit the result.')
  process.exit(1)
}

const files = (code) => [...after.keys()].filter((key) => localeOf(key) === code)
const catalogNames = (code) => files(code).map((key) => key.slice(code.length + 1))
const present = new Set([...after.keys()].map(localeOf))

for (const code of shipped) if (!present.has(code)) problems.push(`${code}: no catalog`)
for (const code of present) {
  if (!shipped.includes(code)) problems.push(`${code}: a catalog for a locale that is not listed`)
}
const catalogsOfEnglish = catalogNames('en')
for (const code of shipped) {
  for (const name of catalogsOfEnglish) {
    if (present.has(code) && !after.has(`${code}/${name}`)) problems.push(`${code}: no ${name}`)
  }
}

const { formatter } = require('@lingui/format-po')
const po = formatter({ lineNumbers: false, origins: false })
/** All of a locale's catalogs as one: a message in two catalogs must read the same in both. */
const parse = (code) => {
  const merged = {}
  for (const key of files(code)) {
    const catalog = po.parse(after.get(key), { locale: code, sourceLocale: 'en', filename: key })
    for (const [id, entry] of Object.entries(catalog)) {
      const held = merged[id]
      if (held && held.translation !== entry.translation) {
        problems.push(`${code}: "${id}" reads differently in two catalogs`)
      }
      merged[id] = entry
    }
  }
  return merged
}

const english = present.has('en') ? parse('en') : {}
for (const code of shipped) {
  if (!present.has(code)) continue
  if (files(code).some((key) => /^#~ /m.test(after.get(key))))
    problems.push(`${code}: obsolete messages`)
  const catalog = parse(code)
  const missing = []
  const broken = []
  const plurals = []
  const needed = requiredPlurals(code)
  for (const [id, entry] of Object.entries(english)) {
    const translation = catalog[id]?.translation
    if (!translation || translation.trim() === '') {
      missing.push(id)
    } else if (placeholders(translation) !== placeholders(entry.message ?? id)) {
      broken.push(id)
    } else if (catalog[id]?.extra?.flags?.includes('fuzzy')) {
      missing.push(id)
    } else if (pluralBlocks(translation).some((found) => [...needed].some((c) => !found.has(c)))) {
      plurals.push(id)
    }
  }
  if (missing.length > 0) {
    problems.push(`${code}: ${missing.length} message(s) missing a translation`)
    problems.push(...listIds(missing))
  }
  if (plurals.length > 0) {
    problems.push(
      `${code}: ${plurals.length} plural(s) without every category it needs (${[...needed].join(', ')})`,
    )
    problems.push(...listIds(plurals))
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
