import { describe, expect, it } from 'vitest'
import { contrast, lighterHex, mixHex, paintFor } from './census-paint'

const rgb = (hex: string): [number, number, number] =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]

const LIGHT = { ink: '#0c1d2b', surface: '#ffffff' }
const DARK = { ink: '#e4f3fc', surface: '#0c1e2a' }
const SLOTS = {
  light: ['#008de4', '#d95926', '#1e9586', '#bd7f00', '#d55181', '#6b8e00', '#167a46', '#7a8b98'],
  dark: ['#1a9cf0', '#d95926', '#1ea898', '#c98500', '#d55181', '#7a9a22', '#4cc38a', '#557384'],
}

describe('segment paint', () => {
  for (const [theme, inks] of [
    ['light', LIGHT],
    ['dark', DARK],
  ] as const) {
    it(`gives every ${theme} slot a label of at least 4.5:1`, () => {
      for (const fill of SLOTS[theme]) {
        const p = paintFor(fill, inks.ink, inks.surface)
        expect(contrast(rgb(p.background), rgb(p.color)), fill).toBeGreaterThanOrEqual(4.5)
        expect([inks.ink, inks.surface]).toContain(p.color)
      }
    })
  }

  it('keeps a fill that already reads well', () => {
    expect(paintFor('#ffffff', LIGHT.ink, LIGHT.surface)).toEqual({
      background: '#ffffff',
      color: LIGHT.ink,
    })
  })

  it('leaves colours it cannot read alone', () => {
    expect(paintFor('rgb(1, 2, 3)', LIGHT.ink, LIGHT.surface)).toEqual({
      background: 'rgb(1, 2, 3)',
      color: LIGHT.ink,
    })
    expect(mixHex('var(--x)', '#ffffff', 0.5)).toBe('var(--x)')
  })

  it('mixes two hex colours', () => {
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080')
    expect(mixHex('#fff', '#000', 0)).toBe('#ffffff')
  })
})

describe('lighterHex', () => {
  it('picks the lighter of two colours', () => {
    expect(lighterHex('#FFFFFF', '#0C1D2B')).toBe('#FFFFFF')
    expect(lighterHex('#0C1E2A', '#DCE8F0')).toBe('#DCE8F0')
  })

  it('keeps the first when either is no hex colour', () => {
    expect(lighterHex('#0C1E2A', 'oklch(0.9 0 0)')).toBe('#0C1E2A')
  })
})
