import { describe, expect, it } from 'vitest'
import { TRANSITION_TYPES } from '@/lib/tx-types'
import { humanizeType, transitionBadgeType } from './transition-type'

describe('transitionBadgeType', () => {
  it('maps every Explorer transition name to its badge type', () => {
    for (const t of TRANSITION_TYPES) {
      if (t === 'shielded' || t === 'batch') continue
      expect(transitionBadgeType(t.toUpperCase().replaceAll('-', '_'))).toBe(t)
    }
  })

  it('shows what a batch does when Explorer says, and a plain batch otherwise', () => {
    expect(transitionBadgeType('BATCH', 'DOCUMENT_CREATE')).toBe('document-create')
    expect(transitionBadgeType('BATCH', 'TOKEN_TRANSFER')).toBe('token-transfer')
    expect(transitionBadgeType('BATCH', 'SOMETHING_NEW')).toBe('batch')
    expect(transitionBadgeType('BATCH', 3)).toBe('batch')
    expect(transitionBadgeType('BATCH')).toBe('batch')
  })

  it('does not guess at a type it does not know', () => {
    expect(transitionBadgeType('FUTURE_THING')).toBeUndefined()
    expect(humanizeType('FUTURE_THING')).toBe('Future thing')
  })
})
