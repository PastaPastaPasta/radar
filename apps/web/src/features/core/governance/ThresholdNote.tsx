import { useLingui } from '@lingui/react/macro'
import { formatInt } from '@/lib/format'
import type { FundingThreshold, ProposalIndex } from './threshold'

/** What the funding threshold is and which count it comes from, or why it isn't known yet. */
export function ThresholdNote({
  threshold,
  index,
  className = 'rx-note p-3',
}: {
  threshold: FundingThreshold | undefined
  index: ProposalIndex
  className?: string
}) {
  const { t } = useLingui()
  if (!threshold) {
    return index === 'hyphen' ? (
      <p className={className} data-funding-threshold="unknown">
        {t`The exact funding threshold isn’t known until DAPI’s masternode list answers. Until then, Passing is Dash Core’s own flag as Hyphen reports it.`}
      </p>
    ) : null
  }
  const { votes, weighted, regular, evonodes, minimum } = threshold
  return (
    <p className={className} data-funding-threshold={votes}>
      {minimum
        ? t`A proposal passes when its yes votes less its no votes reach ${formatInt(votes)}, the network’s minimum: a tenth of the ${formatInt(weighted)} votes of the valid masternodes on DAPI’s list (${formatInt(regular)} masternodes and ${formatInt(evonodes)} evonodes that count four times each) is less.`
        : t`A proposal passes when its yes votes less its no votes reach ${formatInt(votes)}: a tenth of the ${formatInt(weighted)} votes of the valid masternodes on DAPI’s list, ${formatInt(regular)} masternodes and ${formatInt(evonodes)} evonodes that count four times each.`}
    </p>
  )
}
