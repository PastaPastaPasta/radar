import { describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'
import { REVOKE_REASONS } from './revoke-reason'

describe('ProUpRevTx reason codes @HY-07', () => {
  it('names all four codes as Dash Core does', () => {
    expect(REVOKE_REASONS.map((m) => i18n._(m))).toEqual([
      'Not specified',
      'Termination of service',
      'Compromised keys',
      'Change of keys',
    ])
  })
})
