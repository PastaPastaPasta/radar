import { describe, expect, it } from 'vitest'
import type { HyProposal } from '@/data/hyphen/schemas'
import { proposalStatus } from './status'
import { fundingThreshold, withThreshold } from './threshold'

const nodes = (regular: number, evonodes: number, banned = 0) => [
  ...Array.from({ length: regular }, () => ({ type: 0, isValid: true })),
  ...Array.from({ length: evonodes }, () => ({ type: 1, isValid: true })),
  ...Array.from({ length: banned }, () => ({ type: 1, isValid: false })),
]

describe('fundingThreshold', () => {
  it('is a tenth of the valid masternodes, each evonode counted four times, as Dash Core gives it', () => {
    // Mainnet on 18 Nov 2026: Core's getgovernanceinfo said fundingthreshold 317.
    expect(fundingThreshold(nodes(1_734, 360, 906), 'mainnet')).toEqual({
      votes: 317,
      weighted: 3_174,
      regular: 1_734,
      evonodes: 360,
    })
    // Testnet the same day: fundingthreshold 23.
    expect(fundingThreshold(nodes(67, 43, 295), 'testnet').votes).toBe(23)
  })

  it('never asks for fewer than the network’s minimum quorum', () => {
    expect(fundingThreshold(nodes(30, 0), 'mainnet').votes).toBe(10)
    expect(fundingThreshold(nodes(3, 0), 'testnet').votes).toBe(1)
  })
})

describe('withThreshold', () => {
  const p = (yes: number, no: number, extra: Partial<HyProposal> = {}): HyProposal =>
    ({
      hash: 'a'.repeat(64),
      name: 'p',
      votes: { yes, no, abstain: 0 },
      fundingThreshold: 210,
      meetsFundingThreshold: yes - no >= 210,
      funded: false,
      valid: true,
      startTime: 0,
      endTime: Date.UTC(2030, 0, 1),
      paymentAmount: 1n,
      ...extra,
    }) as unknown as HyProposal
  const threshold = { votes: 317, weighted: 3_174, regular: 1_734, evonodes: 360 }
  const now = Date.UTC(2026, 10, 18)

  it('measures a proposal against Core’s threshold, not the index’s unweighted one', () => {
    // dashcentral-operations4: 366 yes, 102 no; Hyphen said it passes at 210, Core needs 317.
    const short = withThreshold(p(366, 102), threshold)
    expect(short.fundingThreshold).toBe(317)
    expect(proposalStatus(short, now)).toBe('failing')
    expect(proposalStatus(withThreshold(p(753, 62), threshold), now)).toBe('passing')
    expect(proposalStatus(withThreshold(p(317, 0), threshold), now)).toBe('passing')
  })

  it('keeps a proposal in the budget only while it passes', () => {
    expect(proposalStatus(withThreshold(p(753, 62, { funded: true }), threshold), now)).toBe(
      'funded',
    )
    expect(proposalStatus(withThreshold(p(300, 0, { funded: true }), threshold), now)).toBe(
      'failing',
    )
  })

  it('leaves the proposal as the index has it until the list answers', () => {
    const q = p(366, 102)
    expect(withThreshold(q, undefined)).toBe(q)
  })
})
