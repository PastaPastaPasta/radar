import { describe, expect, it } from 'vitest'
import {
  contestRef,
  isContestedLabel,
  isValidLabel,
  labelOf,
  labelProblem,
  normalizeLabel,
} from '@/data/query/prefetch/p-vote'

describe('homograph-safe form', () => {
  it.each([
    ['alice', 'a11ce'],
    ['Alice', 'a11ce'],
    ['BOB', 'b0b'],
    ['hello', 'he110'],
    ['ali', 'a11'],
    ['pshenmic', 'pshenm1c'],
    ['therealslimshaddy5', 'therea1s11mshaddy5'],
    ['a-b0', 'a-b0'],
    ['', ''],
  ])('%s → %s', (input, expected) => {
    expect(normalizeLabel(input)).toBe(expected)
  })

  it('is stable: a normalised form normalises to itself', () => {
    for (const label of ['a11ce', 'b0b', 'he110', 'x-y-z1']) {
      expect(normalizeLabel(label)).toBe(label)
    }
  })
})

describe('label and name', () => {
  it('drops the top-level domain once, in any case', () => {
    expect(labelOf('alice.dash')).toBe('alice')
    expect(labelOf(' Alice.DASH ')).toBe('Alice')
    expect(labelOf('alice')).toBe('alice')
    expect(labelOf('a.dash.dash')).toBe('a.dash')
  })
})

describe('validity', () => {
  it.each([
    ['', 'empty'],
    ['ab', 'too-short'],
    ['a'.repeat(64), 'too-long'],
    ['al ice', 'characters'],
    ['alice.eth', 'characters'],
    ['ünï', 'characters'],
    ['-abc', 'hyphen-edge'],
    ['abc-', 'hyphen-edge'],
  ])('%j is invalid: %s', (label, why) => {
    expect(labelProblem(label)).toBe(why)
    expect(isValidLabel(label)).toBe(false)
  })

  it.each(['abc', 'a-c', 'Alice', 'a1b2c3', 'a'.repeat(63), 'x--y'])('%s is valid', (label) => {
    expect(labelProblem(label)).toBeNull()
  })
})

describe('contested rule', () => {
  it.each([
    ['alice', true],
    ['Bob', true],
    ['abc', true],
    ['a'.repeat(19), true],
    ['a-b', true],
    ['ab1', true],
    ['a'.repeat(20), false],
    ['alice2', false],
    ['x9y', false],
    ['ab', false],
    ['-ab', false],
  ])('%s contested: %s', (label, expected) => {
    expect(isContestedLabel(label)).toBe(expected)
  })

  it('judges the normalised form, so o, i and l count as the digits they become', () => {
    expect(isContestedLabel('hello')).toBe(true)
    expect(isContestedLabel('hell0')).toBe(true)
  })
})

describe('contest index values', () => {
  it('are the parent domain and the normalised label', () => {
    expect(contestRef('Alice.dash', {}).indexValues).toEqual(['dash', 'a11ce'])
  })
})
