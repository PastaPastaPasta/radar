import { useLingui } from '@lingui/react/macro'
import type { HyProposal } from '@/data/hyphen/schemas'

/** Insight reports votes but not funding, so what the Funded and Passing labels say is Radar's own working. */
export function DerivedFundingNote({
  proposals,
  className = 'rx-note p-3',
}: {
  proposals: readonly HyProposal[]
  className?: string
}) {
  const { t } = useLingui()
  const timed = proposals.every((p) => p.funded != null)
  return (
    <p className={className} data-derived-funding>
      {timed
        ? t`Insight doesn’t report funding. Funded and Passing are worked out by Radar from Insight’s vote counts and the time of the next superblock.`
        : t`Insight doesn’t report funding, and the time of the next superblock isn’t known, so no proposal is shown as Funded. Passing is worked out by Radar from Insight’s vote counts.`}
    </p>
  )
}
