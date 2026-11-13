import { describe, expect, it } from 'vitest'
import { changeTone, kindOf, matchesKind, valueText } from './changes-model'

describe('the changes model', () => {
  it('groups each recorded field under one kind @RA-80', () => {
    const fields: Record<string, string> = {
      registered: 'joins',
      removed: 'joins',
      returned: 'joins',
      pose: 'pose',
      service: 'address',
      platform_p2p: 'address',
      platform_https: 'address',
      payout_address: 'keys',
      voting_address: 'keys',
      pubkey_operator: 'keys',
      platform_node_id: 'keys',
      operator_reward: 'keys',
    }
    for (const [field, kind] of Object.entries(fields)) expect(kindOf(field)).toBe(kind)
    expect(kindOf('something_new')).toBeUndefined()
    expect(matchesKind('pose', 'pose')).toBe(true)
    expect(matchesKind('pose', 'keys')).toBe(false)
    expect(matchesKind('something_new', 'all')).toBe(true)
  })

  it('colours bans, revivals, joins and removals apart @RA-80', () => {
    expect(changeTone({ field: 'pose', new: 'enabled' })).toBe('success')
    expect(changeTone({ field: 'pose', new: 'banned at 12' })).toBe('warning')
    expect(changeTone({ field: 'registered', new: 'x' })).toBe('success')
    expect(changeTone({ field: 'removed', new: null })).toBe('danger')
    expect(changeTone({ field: 'service', new: 'x' })).toBe('neutral')
  })

  it('writes a stored value as people read it @RA-80', () => {
    const words = { enabled: 'Enabled', banned: (h: string) => `Banned at block ${h}` }
    expect(valueText('pose', 'enabled', words)).toBe('Enabled')
    expect(valueText('pose', 'banned at 2569866', words)).toBe('Banned at block 2569866')
    expect(valueText('operator_reward', 0, words)).toBe('0%')
    expect(valueText('pubkey_operator', 'a'.repeat(96), words)).toBe(
      `${'a'.repeat(10)}…${'a'.repeat(10)}`,
    )
    expect(valueText('service', null, words)).toBe('–')
    expect(valueText('service', '1.2.3.4:9999', words)).toBe('1.2.3.4:9999')
  })
})
