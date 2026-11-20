import { describe, expect, it } from 'vitest'
import { nonceValue } from './nonce'

describe('nonceValue', () => {
  it('drops the skipped-nonce bits Platform packs above the nonce', () => {
    expect(nonceValue(4_611_687_117_939_015_721n)).toBe(41n)
  })

  it('leaves a nonce with no skipped ones as it is', () => {
    expect(nonceValue(0n)).toBe(0n)
    expect(nonceValue(7n)).toBe(7n)
    expect(nonceValue(0xff_ffff_ffffn)).toBe(0xff_ffff_ffffn)
  })
})
