import { useLingui } from '@lingui/react/macro'
import { formatInt } from '@/lib/format'
import type { FundingThreshold } from './threshold'

/** What the funding threshold is and which count it comes from. */
export function ThresholdNote({
  threshold,
  className = 'rx-note p-3',
}: {
  threshold: FundingThreshold
  className?: string
}) {
  const { t } = useLingui()
  const { votes, weighted, regular, evonodes } = threshold
  return (
    <p className={className} data-funding-threshold={votes}>
      {t`A proposal passes when its yes votes less its no votes reach ${formatInt(votes)}: a tenth of the ${formatInt(weighted)} votes of the valid masternodes on DAPI’s list, ${formatInt(regular)} masternodes and ${formatInt(evonodes)} evonodes that count four times each.`}
    </p>
  )
}
