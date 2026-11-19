import type { HyProposal } from './hyphen/schemas'

/** What Dash Core's next superblock can pay (`getgovernanceinfo`'s `governancebudget`, in duffs) and when it comes (ms). */
export interface SuperblockBudget {
  budget: bigint
  superblockAt: number
}

type Fundable = Pick<
  HyProposal,
  'hash' | 'paymentAmount' | 'startTime' | 'endTime' | 'votes' | 'meetsFundingThreshold'
>

/**
 * The proposals Dash Core would pay in the next superblock, the way it builds one: those that meet the funding
 * threshold and whose payment window covers the superblock, most net yes votes first (the larger hash on a tie), each
 * taken while what is left of the budget covers its payment. One that doesn't fit leaves the rest to the next.
 */
export function fundedInBudget(list: readonly Fundable[], at: SuperblockBudget): Set<string> {
  const net = (p: Fundable) => p.votes.yes - p.votes.no
  const passing = list
    .filter(
      (p) =>
        p.meetsFundingThreshold === true &&
        p.startTime <= at.superblockAt &&
        p.endTime >= at.superblockAt,
    )
    .sort((a, b) => net(b) - net(a) || (a.hash < b.hash ? 1 : -1))
  const funded = new Set<string>()
  let left = at.budget
  for (const p of passing) {
    if (p.paymentAmount > left) continue
    left -= p.paymentAmount
    funded.add(p.hash)
  }
  return funded
}

/** Each proposal's `funded` from the budget; without one, no proposal is said to be funded or not. */
export function withBudget(
  list: readonly HyProposal[],
  at: SuperblockBudget | undefined,
): HyProposal[] {
  if (!at) return list.map((p) => ({ ...p, funded: undefined }))
  const funded = fundedInBudget(list, at)
  return list.map((p) => ({ ...p, funded: funded.has(p.hash) }))
}
