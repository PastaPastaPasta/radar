import { describe, expect, it } from 'vitest'
import { keepWithinNetwork } from './queries'

describe('keepWithinNetwork @PE-05 @PE-36', () => {
  const previous = { rows: ['mainnet contract'] }

  it('keeps the last answer while the next window of the same network loads', () => {
    expect(keepWithinNetwork('mainnet')(previous, { queryKey: ['mainnet', 'pe', 'x'] })).toBe(
      previous,
    )
  })

  it('drops it when the network changed, so another network’s rows never stand in', () => {
    expect(
      keepWithinNetwork('testnet')(previous, { queryKey: ['mainnet', 'pe', 'x'] }),
    ).toBeUndefined()
  })

  it('has nothing to keep on the first read', () => {
    expect(keepWithinNetwork('mainnet')(undefined, undefined)).toBeUndefined()
  })
})
