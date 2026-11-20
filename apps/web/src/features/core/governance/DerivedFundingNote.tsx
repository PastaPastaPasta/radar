import { useLingui } from '@lingui/react/macro'
import type { SuperblockBudget } from '@/data/governance-budget'
import { formatAmountText } from '@/lib/units'

/** Neither index reports which proposals the next superblock pays, so Funded is Radar's own working, and says so. */
export function DerivedFundingNote({
  budget,
  className = 'rx-note p-3',
}: {
  budget: SuperblockBudget | undefined
  className?: string
}) {
  const { t } = useLingui()
  const amount = budget ? formatAmountText(budget.budget, 'duffs') : ''
  return (
    <p className={className} data-derived-funding={budget ? 'budget' : 'unknown'}>
      {budget
        ? t`Funded is worked out by Radar the way Dash Core builds the next superblock: the proposals that pass and whose payment window covers it, most net yes votes first, each while what is left of its ${amount} budget covers it.`
        : t`The next superblock’s budget or time isn’t known, so no proposal is shown as Funded.`}
    </p>
  )
}
