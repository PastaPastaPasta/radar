import { useLingui } from '@lingui/react/macro'
import { DUFFS_PER_DASH, formatFiat } from '@/lib/units'
import { SourceLine, useUnits } from '@/ui'

/** Says where the USD figures came from and how old the rate is, on every page that leads with USD. */
export function RateNote() {
  const { t } = useLingui()
  const { rate, usdPerDash, usdPrimary } = useUnits()
  if (!usdPrimary || !rate || usdPerDash === undefined) return null
  return (
    <p className="rx-ratenote" data-rate-note>
      <span>
        {t`USD at ${formatFiat(DUFFS_PER_DASH, usdPerDash)} per DASH, from ${rate.provider}.`}
      </span>{' '}
      <SourceLine stamp={rate.stamp} />
    </p>
  )
}
