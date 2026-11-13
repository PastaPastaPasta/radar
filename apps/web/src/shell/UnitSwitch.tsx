import { useLingui } from '@lingui/react/macro'
import { useSyncExternalStore } from 'react'
import { useDecentralizedOnly } from '@/data/health'
import { useNetwork } from '@/features/search'
import {
  DISPLAY_UNITS,
  getUnitPrefs,
  subscribeUnitPrefs,
  unitLabel,
  writeUnitPreference,
  type UnitChoice,
} from '@/lib/units'

/** The reader's unit for amounts, changed where amounts are read; Settings keeps the same choice with its explanation. */
export function UnitSwitch({ className }: { className?: string }) {
  const { t } = useLingui()
  const net = useNetwork()
  const prefs = useSyncExternalStore(subscribeUnitPrefs, getUnitPrefs, getUnitPrefs)
  const noFeed = useDecentralizedOnly()
  const priced = net === 'mainnet' && !noFeed
  const value = prefs.unit === 'USD' && !priced ? 'DASH' : prefs.unit
  return (
    <label className={`rx-unit ${className ?? ''}`.trim()} data-unit-switch>
      <span className="dh-sr">{t`Unit for amounts`}</span>
      <select
        value={value}
        title={t`Unit for amounts`}
        onChange={(e) => {
          writeUnitPreference(e.target.value as UnitChoice)
        }}
      >
        {DISPLAY_UNITS.map((u) => (
          <option key={u} value={u}>
            {unitLabel(u)}
          </option>
        ))}
        <option value="USD" disabled={!priced}>
          USD
        </option>
      </select>
    </label>
  )
}
