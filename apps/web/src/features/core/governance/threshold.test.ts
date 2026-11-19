import { describe, expect, it } from 'vitest'
import type { HyProposal } from '@/data/hyphen/schemas'
import { proposalStatus } from './status'
import { fundingThreshold, fundingView, withThreshold } from './threshold'

const nodes = (regular: number, evonodes: number, banned = 0, other = 0) => [
  ...Array.from({ length: regular }, () => ({ type: 0, isValid: true })),
  ...Array.from({ length: evonodes }, () => ({ type: 1, isValid: true })),
  ...Array.from({ length: banned }, () => ({ type: 1, isValid: false })),
  ...Array.from({ length: other }, () => ({ type: 7, isValid: true })),
]

describe('fundingThreshold', () => {
  it('is a tenth of the valid masternodes, each evonode counted four times, as Dash Core gives it', () => {
    // Mainnet on 18 Nov 2026: Core's getgovernanceinfo said fundingthreshold 317.
    expect(fundingThreshold(nodes(1_734, 360, 906), 'mainnet')).toEqual({
      votes: 317,
      weighted: 3_174,
      regular: 1_734,
      evonodes: 360,
      minimum: false,
    })
    // Testnet the same day: fundingthreshold 23.
    expect(fundingThreshold(nodes(67, 43, 295), 'testnet').votes).toBe(23)
  })

  it('never asks for fewer than the network’s minimum quorum, and says when that is what applies', () => {
    expect(fundingThreshold(nodes(30, 0), 'mainnet')).toMatchObject({ votes: 10, minimum: true })
    expect(fundingThreshold(nodes(3, 0), 'testnet')).toMatchObject({ votes: 1, minimum: true })
    expect(fundingThreshold(nodes(100, 0), 'mainnet')).toMatchObject({ votes: 10, minimum: false })
  })

  it('gives a list type it doesn’t know no vote, as Core does', () => {
    expect(fundingThreshold(nodes(100, 0, 0, 50), 'mainnet')).toMatchObject({
      weighted: 100,
      regular: 100,
      evonodes: 0,
    })
  })
})

const NOW = Date.UTC(2026, 10, 18)
const p = (yes: number, no: number, extra: Partial<HyProposal> = {}): HyProposal =>
  ({
    hash: `${yes}`.padStart(64, '0'),
    name: 'p',
    votes: { yes, no, abstain: 0 },
    fundingThreshold: 210,
    meetsFundingThreshold: yes - no >= 210,
    funded: false,
    valid: true,
    startTime: NOW - 86_400_000,
    endTime: Date.UTC(2030, 0, 1),
    paymentAmount: 100n,
    ...extra,
  }) as unknown as HyProposal
const threshold = {
  votes: 317,
  weighted: 3_174,
  regular: 1_734,
  evonodes: 360,
  minimum: false,
}

describe('withThreshold', () => {
  it('measures a proposal against Core’s threshold, not Hyphen’s unweighted one', () => {
    // dashcentral-operations4: 366 yes, 102 no; Hyphen said it passes at 210, Core needs 317.
    const short = withThreshold(p(366, 102), threshold, 'hyphen')
    expect(short.fundingThreshold).toBe(317)
    expect(proposalStatus(short, NOW)).toBe('failing')
    expect(withThreshold(p(317, 0), threshold, 'hyphen').meetsFundingThreshold).toBe(true)
  })

  it('takes Hyphen’s funded flag, Core’s fCachedFunding, until DAPI’s list answers, and leaves the figure unknown', () => {
    const passing = withThreshold(p(366, 102, { funded: false }), undefined, 'hyphen')
    expect(passing).toMatchObject({ meetsFundingThreshold: false, fundingThreshold: null })
    expect(
      withThreshold(p(300, 0, { funded: true }), undefined, 'hyphen').meetsFundingThreshold,
    ).toBe(true)
  })

  it('keeps Insight’s threshold, Core’s own fundingthreshold, until the list answers', () => {
    const q = p(400, 0, { fundingThreshold: 317, meetsFundingThreshold: true })
    expect(withThreshold(q, undefined, 'insight')).toBe(q)
  })
})

describe('fundingView', () => {
  const at = { budget: 300n, superblockAt: NOW + 86_400_000 }

  it('funds the passing proposals, most net yes first, while the budget lasts', () => {
    const out = fundingView(
      [
        p(700, 0, { paymentAmount: 200n }),
        p(600, 0, { paymentAmount: 200n }),
        p(500, 0, { paymentAmount: 100n }),
      ],
      threshold,
      'hyphen',
      at,
    )
    expect(out.map((x) => [x.votes.yes, proposalStatus(x, NOW)])).toEqual([
      [700, 'funded'],
      [600, 'passing'],
      [500, 'funded'],
    ])
  })

  it('works the budget out after the threshold, so the budget follows what passes now', () => {
    // The index measured these against 400 and funded only the first; at 317 the second passes too and the budget,
    // which the index kept for the first alone, reaches it.
    const index = (yes: number, meets: boolean, funded: boolean) =>
      p(yes, 0, {
        fundingThreshold: 400,
        meetsFundingThreshold: meets,
        funded,
        paymentAmount: 100n,
      })
    const out = fundingView(
      [index(450, true, true), index(350, false, false)],
      threshold,
      'insight',
      at,
    )
    expect(out.map((x) => proposalStatus(x, NOW))).toEqual(['funded', 'funded'])
    const tight = fundingView(
      [index(450, true, true), index(350, false, false)],
      threshold,
      'insight',
      { ...at, budget: 150n },
    )
    expect(tight.map((x) => proposalStatus(x, NOW))).toEqual(['funded', 'passing'])
  })

  it('calls nothing funded while the budget or the superblock time isn’t known', () => {
    const out = fundingView([p(700, 0, { funded: true })], threshold, 'hyphen', undefined)
    expect(out[0]).toMatchObject({ funded: undefined })
    expect(proposalStatus(out[0]!, NOW)).toBe('passing')
  })
})
