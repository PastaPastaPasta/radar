import { useLingui } from '@lingui/react/macro'
import { useSyncExternalStore } from 'react'
import { useNetwork } from '@/features/entity'
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
  const mainnet = net === 'mainnet'
  const value = prefs.unit === 'USD' && !mainnet ? 'DASH' : prefs.unit
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
        <option value="USD" disabled={!mainnet}>
          USD
        </option>
      </select>
    </label>
  )
}
