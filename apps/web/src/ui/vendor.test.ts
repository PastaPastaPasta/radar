import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(__dirname, '..', '..', 'vendor', 'dashhq')

describe('vendored dashhq shell', () => {
  const lines = readFileSync(join(ROOT, 'SHA256SUMS'), 'utf8')
    .split('\n')
    .filter((l) => l.trim() !== '')

  it('lists the tokens, components, shell and fonts', () => {
    const names = lines.map((l) => l.split(/\s+/)[1] ?? '')
    expect(names.some((n) => n.endsWith('dashhq-tokens.css'))).toBe(true)
    expect(names.some((n) => n.endsWith('dashhq-components.css'))).toBe(true)
    expect(names.some((n) => n.endsWith('dashhq-shell.css'))).toBe(true)
    expect(names.some((n) => n.endsWith('.woff2'))).toBe(true)
  })

  it.each(lines)('matches its recorded hash: %s', (line) => {
    const [hash, rawName] = line.split(/\s+/)
    const name = (rawName ?? '').replace(/^\*/, '')
    const actual = createHash('sha256')
      .update(readFileSync(join(ROOT, name)))
      .digest('hex')
    expect(actual).toBe(hash)
  })
})
