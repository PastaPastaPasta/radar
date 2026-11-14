import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const kit = readFileSync(join(import.meta.dirname, '../styles/radar-kit.css'), 'utf8')

describe('.rx-hc--pop', () => {
  it('grows from the origin of whichever Radix surface carries it: the hover card or the long-press popover', () => {
    const rule = /\.rx-hc--pop\s*{[^}]*}/.exec(kit)?.[0] ?? ''
    expect(rule).toContain('--radix-hover-card-content-transform-origin')
    expect(rule).toContain('--radix-popover-content-transform-origin')
  })
})
