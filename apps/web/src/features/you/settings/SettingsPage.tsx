import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { useState, useSyncExternalStore } from 'react'
import { rateQueries } from '@/data/rate/queries'
import { stampOf } from '@/data/envelope'
import { useDocumentTitle, useNetwork } from '@/features/entity'
import { AVAILABLE_LOCALES, useLocale } from '@/i18n'
import { readUtcPreference } from '@/lib/format'
import {
  DISPLAY_UNITS,
  getUnitPrefs,
  subscribeUnitPrefs,
  unitLabel,
  writeFiatPreference,
  writeUnitPreference,
  type DisplayUnit,
} from '@/lib/units'
import { Amount, Card, SegFilter, SourceLine } from '@/ui'
import { DevnetSection, type SettingsDevnets } from './DevnetSection'
import { writeUtcPreference } from './preferences'

const SAMPLE_DUFFS = 123_456_789n

export function SettingsPage({ devnets }: { devnets: SettingsDevnets }) {
  const { t } = useLingui()
  const net = useNetwork()
  const prefs = useSyncExternalStore(subscribeUnitPrefs, getUnitPrefs, getUnitPrefs)
  const { locale, setLocale } = useLocale()
  const [utc, setUtc] = useState(readUtcPreference)
  const mainnet = net === 'mainnet'
  const rate = useQuery({ ...rateQueries.usd(), enabled: mainnet && prefs.fiat })

  useDocumentTitle(t`Settings`)

  return (
    <article data-page="/settings" className="grid gap-6">
      <header className="grid gap-2">
        <p data-eyebrow className="text-sm text-[var(--dh-ink-2,inherit)]">
          {t`You`}
        </p>
        <h1 className="text-3xl font-semibold">{t`Settings`}</h1>
        <p className="max-w-2xl text-[var(--dh-ink-2)]">
          {t`These choices stay in this browser. Radar never sends them anywhere.`}
        </p>
      </header>

      <Card id="units" title={t`Amounts`}>
        <div className="grid gap-5">
          <div className="grid gap-2">
            <SegFilter
              label={t`Unit for DASH amounts`}
              value={prefs.unit}
              onChange={(unit) => writeUnitPreference(unit as DisplayUnit)}
              options={DISPLAY_UNITS.map((u) => ({ id: u, label: unitLabel(u) }))}
            />
            <p className="text-[var(--dh-ink-2)]">
              {t`Example`}: <Amount value={SAMPLE_DUFFS} kind="duffs" fiat />
            </p>
          </div>

          <div className="grid gap-1">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={prefs.fiat}
                onChange={(e) => writeFiatPreference(e.target.checked)}
              />
              {t`Show the USD value next to DASH amounts`}
            </label>
            <p className="text-[var(--dh-ink-2)]">
              {mainnet
                ? t`USD is rounded to three significant figures and always follows the DASH figure.`
                : t`Test coins have no value, so Testnet and devnets never show USD.`}
            </p>
            {mainnet && prefs.fiat && rate.data ? <SourceLine stamp={stampOf(rate.data)} /> : null}
          </div>
        </div>
      </Card>

      <Card id="time" title={t`Times`}>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={utc}
            onChange={(e) => {
              setUtc(e.target.checked)
              writeUtcPreference(e.target.checked)
            }}
          />
          {t`Show times in UTC`}
        </label>
        <p className="mt-1 text-[var(--dh-ink-2)]">
          {t`Otherwise times follow this device’s time zone. Hovering a time always shows UTC.`}
        </p>
      </Card>

      <Card id="language" title={t`Language`}>
        <div className="dh-field max-w-xs">
          <label htmlFor="locale">{t`Language`}</label>
          <select
            id="locale"
            className="dh-select"
            value={locale}
            onChange={(e) => void setLocale(e.target.value)}
          >
            {AVAILABLE_LOCALES.map((l) => (
              <option key={l.code} value={l.code} lang={l.code}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
        <p className="mt-2 text-[var(--dh-ink-2)]">
          {t`Text that isn’t translated yet appears in English. Hashes, IDs and amounts are never translated.`}
        </p>
      </Card>

      <DevnetSection devnets={devnets} />
    </article>
  )
}
