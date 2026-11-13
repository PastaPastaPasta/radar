import { describe, expect, it, vi } from 'vitest'
import { P_TOKEN_CLASSES } from '@/data/sdk/methods/p-token'
import { pTokenImpl, type PTokenReads } from '@/data/sdk/worker/impl/p-token'
import { proved } from './fakes'

const A = 'AxAYWyXV6mrm8Sq7vc7wEM18wtL8a8rgj64SM3SDmzsB'
const B = 'DYqxCsuDgYsEAJ2ADnimkwNdL7C4xbe4No4so19X9mmd'
const ID = '5DbLwAxGBzUzo81VewMUwn4b5P4bpv9FNFybi25XB5Bk'

const reads = (over: Partial<Record<keyof PTokenReads, unknown>>) => over as unknown as PTokenReads

describe('tokens.directPurchasePrices', () => {
  it('answers every asked token, null for one with no price, and frees what it read', async () => {
    const free = vi.fn()
    const sdk = reads({
      tokens: {
        directPurchasePricesWithProof: () =>
          Promise.resolve(proved(new Map([[A, { basePrice: '100', currentPrice: '250', free }]]))),
      },
    })
    const out = await pTokenImpl['tokens.directPurchasePrices'](sdk, { tokenIds: [A, B] })
    expect([...out.data]).toEqual([
      [A, { basePrice: 100n, currentPrice: 250n }],
      [B, null],
    ])
    expect(out.response).toBeDefined()
    expect(free).toHaveBeenCalledOnce()
  })
})

describe('tokens.perpetualDistributionLastClaim', () => {
  const ask = (moment: unknown) =>
    pTokenImpl['tokens.perpetualDistributionLastClaim'](
      reads({
        tokens: {
          perpetualDistributionLastClaimWithProof: () => Promise.resolve(proved(moment)),
        },
      }),
      { identityId: ID, tokenId: A },
    )

  it('reads a block, a time and an epoch moment', async () => {
    expect((await ask({ type: 'block', blockHeight: 12n })).data).toEqual({
      type: 'block',
      blockHeight: 12n,
    })
    expect((await ask({ type: 'time', timestampMs: 5n })).data).toEqual({
      type: 'time',
      timestampMs: 5n,
    })
    expect((await ask({ type: 'epoch', epochIndex: 7 })).data).toEqual({
      type: 'epoch',
      epochIndex: 7,
    })
  })

  it('answers null for an identity that never claimed, and for a moment of an unknown kind', async () => {
    expect((await ask(undefined)).data).toBeNull()
    expect((await ask({ type: 'later' })).data).toBeNull()
  })
})

describe('dpns.resolveName', () => {
  it('answers the identity, or null for a name nobody holds, without a proof', async () => {
    const resolveName = vi.fn((name: string) =>
      Promise.resolve(name === 'alice.dash' ? ID : undefined),
    )
    const sdk = reads({ dpns: { resolveName } })
    const found = await pTokenImpl['dpns.resolveName'](sdk, { name: 'alice.dash' })
    expect(found.data).toBe(ID)
    expect(found.response).toBeUndefined()
    expect((await pTokenImpl['dpns.resolveName'](sdk, { name: 'bob.dash' })).data).toBeNull()
  })
})

describe('data classes', () => {
  it('reads balances-like facts live and names as structure', () => {
    expect(P_TOKEN_CLASSES).toEqual({
      'tokens.directPurchasePrices': 'live',
      'tokens.perpetualDistributionLastClaim': 'live',
      'dpns.resolveName': 'structural',
    })
  })
})
