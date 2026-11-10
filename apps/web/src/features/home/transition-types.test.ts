import { describe, expect, it } from 'vitest'
import { transitionKind } from './transition-types'

describe('transitionKind', () => {
  it('names a plain transition type', () => {
    expect(transitionKind('IDENTITY_TOP_UP')).toEqual({
      type: 'identity-top-up',
      label: 'Identity top-up',
    })
    expect(transitionKind('MASTERNODE_VOTE').type).toBe('masternode-vote')
  })

  it('names a batch by what it holds', () => {
    expect(transitionKind('BATCH', 'DOCUMENT_CREATE')).toEqual({
      type: 'batch',
      label: 'Document create',
    })
    expect(transitionKind('BATCH')).toEqual({ type: 'batch', label: 'Batch' })
  })

  it('groups shielded transitions and falls back to a batch badge for a type it has not met', () => {
    expect(transitionKind('SHIELD_TRANSFER').type).toBe('shielded')
    expect(transitionKind('SOMETHING_NEW')).toEqual({ type: 'batch', label: 'Something new' })
  })
})
