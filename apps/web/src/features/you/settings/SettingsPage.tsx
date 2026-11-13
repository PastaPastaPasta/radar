import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { useState, useSyncExternalStore } from 'react'
import { rateQueries } from '@/data/rate/queries'
import { stampOf } from '@/data/envelope'
import { PageLink, useDocumentTitle, useNetwork } from '@/features/entity'
import { LanguageSelect } from '@/i18n/LanguageSelect'
import { readUtcPreference } from '@/lib/format'
import {
  DISPLAY_UNITS,
  DUFFS_PER_DASH,
  denomination,
  formatFiat,
  getUnitPrefs,
  subscribeUnitPrefs,
  unitLabel,
  writeFiatPreference,
  writeUnitPreference,
  type UnitChoice,
} from '@/lib/units'
import {
  Amount,
  Card,
  SegFilter,
  SourceLine,
  SourceModeSwitch,
  Unavailable,
  useSourceMode,
} from '@/ui'
import { DevnetSection, type SettingsDevnets } from './DevnetSection'
import { writeUtcPreference } from './preferences'

const SAMPLE_DUFFS = 123_456_789n

export function SettingsPage({ devnets }: { devnets: SettingsDevnets }) {
  const { t } = useLingui()
  const net = useNetwork()
  const prefs = useSyncExternalStore(subscribeUnitPrefs, getUnitPrefs, getUnitPrefs)
  const [utc, setUtc] = useState(readUtcPreference)
  const decentralized = useSourceMode().mode === 'decentralized'
  const mainnet = net === 'mainnet'
  const priced = mainnet && !decentralized
  const usdPrimary = priced && prefs.unit === 'USD'
  const showsRate = priced && (prefs.fiat || usdPrimary)
  const rate = useQuery({ ...rateQueries.usd(), enabled: showsRate })
  const unit = prefs.unit === 'USD' && !priced ? 'DASH' : prefs.unit
  const unitName = unitLabel(denomination(unit))

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
                { id: 'USD', label: 'USD', disabled: !priced },
              ]}
            />
            {mainnet && decentralized ? <Unavailable source="rate" compact /> : null}
            <p className="text-[var(--dh-ink-2)]">
              {!mainnet
                ? t`USD is for mainnet only: test coins have no value.`
                : usdPrimary
                  ? t`USD comes first, with the DASH figure after it once the rate is in.`
                  : decentralized
                    ? t`Amounts show in ${unitName}.`
                    : t`Amounts show in ${unitName}. Choose USD to lead with the dollar value.`}
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
                disabled={usdPrimary || (mainnet && decentralized)}
                onChange={(e) => writeFiatPreference(e.target.checked)}
              />
              {t`Show the USD value next to DASH amounts`}
            </label>
            <p className="text-[var(--dh-ink-2)]">
              {!mainnet
                ? t`Test coins have no value, so Testnet and devnets never show USD.`
                : usdPrimary
                  ? t`USD is rounded to three significant figures. This choice doesn’t apply while USD comes first.`
                  : t`USD is rounded to three significant figures and follows the amount in ${unitName}.`}
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

      <Card id="sources" title={t`Sources`}>
        <div className="grid gap-2">
          <SourceModeSwitch />
          <p>
            <PageLink to="/sources">{t`See every source`}</PageLink>
          </p>
        </div>
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
