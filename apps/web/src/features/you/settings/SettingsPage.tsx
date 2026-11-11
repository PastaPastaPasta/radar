import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { useState, useSyncExternalStore } from 'react'
import { rateQueries } from '@/data/rate/queries'
import { stampOf } from '@/data/envelope'
import { useDocumentTitle, useNetwork } from '@/features/entity'
import { LanguageSelect } from '@/i18n/LanguageSelect'
import { readUtcPreference } from '@/lib/format'
import {
  DISPLAY_UNITS,
  DUFFS_PER_DASH,
  formatFiat,
  getUnitPrefs,
  subscribeUnitPrefs,
  unitLabel,
  writeFiatPreference,
  writeUnitPreference,
  type UnitChoice,
} from '@/lib/units'
import { Amount, Card, SegFilter, SourceLine } from '@/ui'
import { DevnetSection, type SettingsDevnets } from './DevnetSection'
import { writeUtcPreference } from './preferences'

const SAMPLE_DUFFS = 123_456_789n

export function SettingsPage({ devnets }: { devnets: SettingsDevnets }) {
  const { t } = useLingui()
  const net = useNetwork()
  const prefs = useSyncExternalStore(subscribeUnitPrefs, getUnitPrefs, getUnitPrefs)
  const [utc, setUtc] = useState(readUtcPreference)
  const mainnet = net === 'mainnet'
  const usdPrimary = mainnet && prefs.unit === 'USD'
  const showsRate = mainnet && (prefs.fiat || usdPrimary)
  const rate = useQuery({ ...rateQueries.usd(), enabled: showsRate })
  const unit = prefs.unit === 'USD' && !mainnet ? 'DASH' : prefs.unit

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
              label={t`Unit for amounts`}
              value={unit}
              onChange={(next) => writeUnitPreference(next as UnitChoice)}
              options={[
                ...DISPLAY_UNITS.map((u) => ({ id: u, label: unitLabel(u) })),
                { id: 'USD', label: 'USD', disabled: !mainnet },
              ]}
            />
            <p className="text-[var(--dh-ink-2)]">
              {mainnet
                ? t`USD leads Dash amounts and shows the DASH figure after it, once the rate is in.`
                : t`USD is for mainnet only: test coins have no value.`}
            </p>
            <p className="text-[var(--dh-ink-2)]">
              {t`Example`}: <Amount value={SAMPLE_DUFFS} kind="duffs" fiat />
            </p>
          </div>

          <div className="grid gap-1">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={prefs.fiat}
                disabled={usdPrimary}
                onChange={(e) => writeFiatPreference(e.target.checked)}
              />
              {t`Show the USD value next to DASH amounts`}
            </label>
            <p className="text-[var(--dh-ink-2)]">
              {mainnet
                ? t`USD is rounded to three significant figures and always follows the DASH figure.`
                : t`Test coins have no value, so Testnet and devnets never show USD.`}
            </p>
            {showsRate && rate.data ? (
              <p className="flex flex-wrap items-center gap-x-3 text-[var(--dh-ink-2)]">
                <span data-rate-note>
                  {t`Rate: ${formatFiat(DUFFS_PER_DASH, rate.data.data.usd)} per DASH, from ${rate.data.data.provider}.`}
                </span>
                <SourceLine stamp={stampOf(rate.data)} />
              </p>
            ) : null}
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
          <LanguageSelect id="locale" />
        </div>
        <p className="mt-2 text-[var(--dh-ink-2)]">
          {t`Text that isn’t translated yet appears in English. Hashes, IDs and amounts are never translated.`}
        </p>
      </Card>

      <DevnetSection devnets={devnets} />
    </article>
  )
}
