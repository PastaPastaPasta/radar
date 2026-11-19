import type { HyProposal } from '@/data/hyphen/schemas'

export type ProposalStatus = 'funded' | 'passing' | 'failing' | 'ended' | 'invalid'

/**
 * Where a proposal stands. `funded` is Radar's working of the next superblock (`fundingView`): the proposal passes and
 * the budget reaches it. Hyphen's own `funded` flag is Core's `fCachedFunding`, which says only that it passes, so it
 * is never read as `funded` here. `passing` means it has the net votes but the budget doesn't reach it, or the budget
 * isn't known.
 */
export function proposalStatus(p: HyProposal, now: number): ProposalStatus {
  if (p.valid === false) return 'invalid'
  if (p.endTime < now) return 'ended'
  if (p.funded) return 'funded'
  if (p.meetsFundingThreshold) return 'passing'
  return 'failing'
}

/** Net yes minus no votes, the number a proposal needs to reach `fundingThreshold`. */
export function netVotes(p: HyProposal): number {
  return p.votes.yes - p.votes.no
}

export function totalVotes(p: HyProposal): number {
  return p.votes.yes + p.votes.no + p.votes.abstain
}

export interface BudgetSplit {
  funded: bigint
  passing: bigint
  failing: bigint
  count: { funded: number; passing: number; failing: number }
}

/** Open proposals by what their payment would be: in the budget, passing but not in it, or short of votes. */
export function budgetSplit(proposals: readonly HyProposal[], now: number): BudgetSplit {
  const split: BudgetSplit = {
    funded: 0n,
    passing: 0n,
    failing: 0n,
    count: { funded: 0, passing: 0, failing: 0 },
  }
  for (const p of proposals) {
    const status = proposalStatus(p, now)
    if (status === 'funded' || status === 'passing' || status === 'failing') {
      split[status] += p.paymentAmount
      split.count[status]++
    }
  }
  return split
}

/** Only https links are shown as links; a proposal URL is typed by whoever submitted it. */
export function safeProposalUrl(url: string | null | undefined): URL | undefined {
  if (!url) return undefined
  try {
    const u = new URL(url)
    return u.protocol === 'https:' ? u : undefined
  } catch {
    return undefined
  }
}
