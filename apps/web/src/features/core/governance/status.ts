import type { HyProposal } from '@/data/hyphen/schemas'
import type { NetworkId } from '@/lib/network'

export type ProposalStatus = 'funded' | 'passing' | 'failing' | 'ended' | 'invalid'

/**
 * Where a proposal stands, from the flags Hyphen reports. `funded` means the proposal is in the
 * budget that will be paid; `passing` means it has the net votes to be, but is not in it yet.
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

/** Only web links are shown as links; a proposal URL is typed by whoever submitted it. */
export function safeProposalUrl(url: string | null | undefined): URL | undefined {
  if (!url) return undefined
  try {
    const u = new URL(url)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u : undefined
  } catch {
    return undefined
  }
}

/** Governance reads `?network=` like the other dashhq products; mainnet is the absence of it. */
export function govProposalUrl(hash: string, net: NetworkId = 'mainnet'): string {
  const base = `https://gov.dashhq.org/p/h/${encodeURIComponent(hash)}`
  return net === 'mainnet' ? base : `${base}?network=${encodeURIComponent(net)}`
}
