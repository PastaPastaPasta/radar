import { describe, expect, it } from 'vitest'
import { adaptAddressTx, adaptPendingTx, adaptProposals, adaptUtxo, insightTxType } from './adapt'
import type { InsProposal, InsTx } from './schemas'

const A = 'yjSvwyLB5X4dqQqVMPMu6UdrFpYZ3u9v5U'
const OTHER = 'yLdootTwA9TTEN5GEgD5hBaaqZhGRALMhB'
const H = (n: number) => n.toString(16).padStart(64, '0')

function tx(over: Partial<InsTx>): InsTx {
  return {
    txid: H(1),
    vin: [],
    vout: [],
    blockheight: 100,
    blocktime: 1_700_000_000_000,
    ...over,
  }
}

describe('adaptAddressTx', () => {
  it('nets what the address received less what it spent', () => {
    const row = adaptAddressTx(
      tx({
        vin: [{ addr: A, valueSat: 56_798_928_573n }],
        vout: [
          { n: 0, value: 100_000_000n, scriptPubKey: { hex: '', addresses: [OTHER] } },
          { n: 1, value: 56_698_928_348n, scriptPubKey: { hex: '', addresses: [A] } },
        ],
      }),
      A,
    )
    expect(row).toMatchObject({
      txHash: H(1),
      blockHeight: 100,
      blockTime: 1_700_000_000_000,
      netValue: -100_000_225n,
      direction: 'out',
      valueOut: 56_798_928_348n,
    })
  })

  it('is an incoming row when the address only received', () => {
    const row = adaptAddressTx(
      tx({ vout: [{ n: 0, value: 5n, scriptPubKey: { hex: '', addresses: [A] } }] }),
      A,
    )
    expect(row).toMatchObject({ netValue: 5n, direction: 'in' })
  })

  it('leaves out a transaction that is not in a block yet', () => {
    expect(adaptAddressTx(tx({ blockheight: -1 }), A)).toBeUndefined()
    expect(adaptAddressTx(tx({ blockheight: null }), A)).toBeUndefined()
    expect(adaptAddressTx(tx({ confirmations: 0 }), A)).toBeUndefined()
  })
})

describe('adaptPendingTx', () => {
  it('nets an unconfirmed transaction for the pending area, and is nothing for a mined one', () => {
    const spend = {
      blockheight: null,
      confirmations: 0,
      vin: [{ addr: A, valueSat: 900n }],
      vout: [
        { n: 0, value: 600n, scriptPubKey: { hex: '', addresses: [OTHER] } },
        { n: 1, value: 250n, scriptPubKey: { hex: '', addresses: [A] } },
      ],
    }
    expect(adaptPendingTx(tx(spend), A)).toEqual({ txid: H(1), net: -650n })
    expect(adaptPendingTx(tx({ ...spend, blockheight: 100, confirmations: 3 }), A)).toBeUndefined()
  })
})

describe('insightTxType', () => {
  it('names special transactions the way Hyphen does, and a coinbase input as a coinbase', () => {
    expect(insightTxType({ type: 8, vin: [] })).toBe('asset_lock')
    expect(insightTxType({ type: 9, vin: [] })).toBe('asset_unlock')
    expect(insightTxType({ type: 5, vin: [] })).toBe('coinbase')
    expect(insightTxType({ type: 6, vin: [] })).toBe('quorum_commitment')
    expect(insightTxType({ type: 7, vin: [] })).toBe('mnhf_signal')
    expect(insightTxType({ type: 1, vin: [] })).toBe('provider_register')
    expect(insightTxType({ vin: [{ coinbase: '03' }] })).toBe('coinbase')
    expect(insightTxType({ type: 0, vin: [{ addr: A }] })).toBe('normal')
    expect(insightTxType({ type: 99, vin: [] })).toBe('normal')
  })
})

describe('adaptUtxo', () => {
  it('keeps the outpoint, value and height', () => {
    expect(
      adaptUtxo({ address: A, txid: H(2), vout: 1, scriptPubKey: '76', satoshis: 9n, height: 7 }),
    ).toEqual({ txHash: H(2), vout: 1, value: 9n, height: 7, scriptPubKey: '76' })
  })

  it('gives an unconfirmed output no height, never block 0', () => {
    const base = { address: A, txid: H(2), vout: 1, scriptPubKey: '76', satoshis: 9n }
    expect(adaptUtxo({ ...base, confirmations: 0 }).height).toBeUndefined()
    expect(adaptUtxo({ ...base, height: 0, confirmations: 0 }).height).toBeUndefined()
    expect(adaptUtxo({ ...base, height: -1 }).height).toBeUndefined()
    expect(adaptUtxo({ ...base, height: 7, confirmations: 3 }).height).toBe(7)
  })
})

describe('adaptProposals', () => {
  const NOW = 1_000
  const COIN = 100_000_000n
  const proposal = (n: number, over: Partial<InsProposal> & { amount?: bigint; end?: number }) =>
    ({
      Hash: H(n),
      DataObject: {
        name: `p${n}`,
        payment_address: A,
        payment_amount: (over.amount ?? 10n) * COIN,
        start_epoch: 0,
        end_epoch: over.end ?? 5_000,
      },
      AbsoluteYesCount: over.AbsoluteYesCount ?? 0,
      YesCount: 0,
      NoCount: 0,
      AbstainCount: 0,
    }) satisfies InsProposal
  const info = { fundingthreshold: 10, governancebudget: 25n * COIN }

  it('funds proposals that meet the threshold, most votes first, while the budget lasts', () => {
    const list = [
      proposal(1, { AbsoluteYesCount: 50 }),
      proposal(2, { AbsoluteYesCount: 80 }),
      proposal(3, { AbsoluteYesCount: 20 }),
      proposal(4, { AbsoluteYesCount: 5 }),
    ]
    const out = adaptProposals(list, info, NOW)
    expect(out.map((p) => [p.name, p.funded, p.meetsFundingThreshold])).toEqual([
      ['p1', true, true],
      ['p2', true, true],
      ['p3', false, true],
      ['p4', false, false],
    ])
    expect(out[0]).toMatchObject({ fundingThreshold: 10, votes: { yes: 0, no: 0, abstain: 0 } })
  })

  it('never funds a proposal whose voting window has ended, or has not begun, at the superblock', () => {
    const out = adaptProposals(
      [
        proposal(1, { AbsoluteYesCount: 90, end: 500 }),
        {
          ...proposal(2, { AbsoluteYesCount: 90 }),
          DataObject: { ...proposal(2, {}).DataObject, start_epoch: 2_000 },
        },
      ],
      info,
      NOW,
    )
    expect(out.map((p) => [p.funded, p.meetsFundingThreshold])).toEqual([
      [false, true],
      [false, true],
    ])
  })

  it('measures windows against the superblock time it is given, not the clock', () => {
    const list = [proposal(1, { AbsoluteYesCount: 90, end: 3_000 })]
    expect(adaptProposals(list, info, 2_999)[0]?.funded).toBe(true)
    expect(adaptProposals(list, info, 3_001)[0]?.funded).toBe(false)
  })

  it('shows no proposal as funded when the superblock time is not known', () => {
    const out = adaptProposals([proposal(1, { AbsoluteYesCount: 90 })], info, undefined)
    expect(out[0]).toMatchObject({ funded: undefined, meetsFundingThreshold: true })
  })
})
