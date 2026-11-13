import { describe, expect, it } from 'vitest'
import { pickRest, resist } from './bottom-sheet'

const rests = { collapsed: 100, half: 400, full: 700 }
const names: ('collapsed' | 'half' | 'full')[] = ['collapsed', 'half', 'full']

describe('the bottom sheet', () => {
  it('gives a little, with resistance, past its lowest and highest rest @RA-52', () => {
    expect(resist(300, 100, 600)).toBe(300)
    expect(resist(50, 100, 600)).toBeLessThan(100)
    expect(resist(50, 100, 600)).toBeGreaterThan(100 - 4 * Math.sqrt(50) - 1)
    expect(resist(700, 100, 600)).toBeGreaterThan(600)
  })

  it('rests at the nearest rest a slow release would reach @RA-52', () => {
    expect(pickRest(names, rests, 380, 0)).toBe('half')
    expect(pickRest(names, rests, 560, 0)).toBe('full')
    expect(pickRest(names, rests, 120, 0)).toBe('collapsed')
  })

  it('goes on to the next rest in the direction of a flick @RA-52', () => {
    expect(pickRest(names, rests, 400, -1)).toBe('full')
    expect(pickRest(names, rests, 400, 1)).toBe('collapsed')
    expect(pickRest(names, rests, 700, -1)).toBe('full')
    expect(pickRest(names, rests, 100, 1)).toBe('collapsed')
  })
})
