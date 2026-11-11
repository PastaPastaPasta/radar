import { describe, expect, it } from 'vitest'
import type { HyProposal } from '@/data/hyphen/schemas'
import { budgetSplit, proposalStatus, safeProposalUrl } from './status'

const NOW = Date.parse('2026-11-10T12:00:00Z')

const proposal = (over: Partial<HyProposal>): HyProposal => ({
  hash: 'a'.repeat(64),
  name: 'p',
  paymentAddress: 'Xaddr',
  paymentAmount: 100n,
  startTime: NOW - 86_400_000,
  endTime: NOW + 86_400_000,
  votes: { yes: 10, no: 2, abstain: 1 },
  fundingThreshold: 5,
  meetsFundingThreshold: false,
  funded: false,
  valid: true,
  ...over,
})

describe('proposal status', () => {
  it('reads funded, passing, failing, ended and invalid from the flags', () => {
    expect(proposalStatus(proposal({ funded: true, meetsFundingThreshold: true }), NOW)).toBe(
      'funded',
    )
    expect(proposalStatus(proposal({ meetsFundingThreshold: true }), NOW)).toBe('passing')
    expect(proposalStatus(proposal({}), NOW)).toBe('failing')
    expect(proposalStatus(proposal({ endTime: NOW - 1, funded: true }), NOW)).toBe('ended')
    expect(proposalStatus(proposal({ valid: false }), NOW)).toBe('invalid')
  })

  it('splits open proposals by the payment they would receive', () => {
    const split = budgetSplit(
      [
        proposal({ funded: true, paymentAmount: 300n }),
        proposal({ meetsFundingThreshold: true, paymentAmount: 200n }),
        proposal({ paymentAmount: 50n }),
        proposal({ endTime: NOW - 1, paymentAmount: 999n }),
      ],
      NOW,
    )
    expect(split).toMatchObject({ funded: 300n, passing: 200n, failing: 50n })
    expect(split.count).toEqual({ funded: 1, passing: 1, failing: 1 })
  })

  it('links only https URLs', () => {
    expect(safeProposalUrl('https://example.org/p')?.host).toBe('example.org')
    expect(safeProposalUrl('http://example.org/p')).toBeUndefined()
    expect(safeProposalUrl('data:text/html,hi')).toBeUndefined()
    expect(safeProposalUrl('javascript:alert(1)')).toBeUndefined()
    expect(safeProposalUrl('not a url')).toBeUndefined()
    expect(safeProposalUrl(null)).toBeUndefined()
  })
})
