import { Trans, useLingui } from '@lingui/react/macro'
import { Link } from '@tanstack/react-router'
import { formatInt, formatPercent } from '@/lib/format'
import { Card, Icon, Time, stampsOf } from '@/ui'
import { NoSourceSection } from '@/ui/section-source'
import { InfoTip } from '../v24/InfoTip'
import { Answer, SegBar, shareTone } from './bars'
import { swatchOf, useCensusColors } from './census-colors'
import type { Census } from './census-data'
import { DKG_CHECK_IDS, GRADES, median } from './census-math'
import { Figure, FigureGrid } from './parts'
import { loadState, type SectionProps } from './shared'

const ENABLED = { status: ['enabled' as const] }

/** Core 24 quorum readiness: one row per DKG connection check, each with its pass rate and a link to its failures. */
export function ReadinessCard({ summary }: SectionProps) {
  const { t } = useLingui()
  const d = summary.data?.data.dkg_readiness
  if (summary.data && !d?.masternodes) return null
  const labels: Record<(typeof DKG_CHECK_IDS)[number], string> = {
    reachable: t`Reachable`,
    platform_ban: t`No Platform ban`,
    protocol: t`Protocol version`,
    relay: t`Transaction relay`,
    filters: t`Compact block filters`,
  }
  const release = typeof d?.rules?.release === 'string' ? d.rules.release : t`Core 24`
  const minProtocol = typeof d?.rules?.min_protocol === 'number' ? d.rules.min_protocol : undefined
  const reachFailures = typeof d?.rules?.reach_failures === 'number' ? d.rules.reach_failures : 3
  const protocolCounts = d?.rules?.protocol_check !== false
  const checks = d
    ? DKG_CHECK_IDS.filter((id) => {
        const c = d.checks[id]
        return c && c.pass + c.fail + c.unknown > 0 && (id !== 'protocol' || protocolCounts)
      })
    : []
  const ready = d && d.masternodes > 0 ? d.overall.pass / d.masternodes : undefined
  const passCount = d ? t`${formatInt(d.overall.pass)} of ${formatInt(d.masternodes)}` : ''
  const passing =
    d && d.overall.pass > 0 ? (
      <Link to="/masternodes" search={{ dkg: ['ready'], ...ENABLED }}>
        {passCount}
      </Link>
    ) : (
      passCount
    )
  return (
    <Card
      level="section"
      title={t`Ready for ${release} quorums`}
      id="readiness"
      layer="network"
      source={stampsOf(summary.data)}
      state={loadState(summary)}
      error={summary.error}
      onRetry={() => void summary.refetch()}
    >
      {d ? (
        <div className="grid gap-4" data-readiness>
          <Answer
            tone={
              ready === undefined
                ? 'neutral'
                : shareTone(ready) === 'bad'
                  ? 'warn'
                  : shareTone(ready)
            }
            pill={ready === undefined ? '–' : t`${formatPercent(ready, 1)} ready`}
          >
            <span className="rx-nanswer__line">
              <Trans>{passing} pass every check</Trans>
              {d.overall.unknown > 0 ? t`, ${formatInt(d.overall.unknown)} unknown` : null}
            </span>
          </Answer>
          <ul className="rx-ncheck">
            {checks.map((id) => {
              const c = d.checks[id]!
              const known = c.pass + c.fail + c.unknown
              const extra =
                id === 'protocol' && minProtocol !== undefined
                  ? t`needs ${String(minProtocol)}+`
                  : id === 'reachable'
                    ? t`fails after ${String(reachFailures)} missed checks in a row`
                    : id === 'platform_ban'
                      ? t`evonodes only`
                      : undefined
              const tone = c.fail > 0 ? 'warn' : c.pass > 0 ? 'good' : 'neutral'
              return (
                <li key={id}>
                  <span className="rx-ncheck__mark" data-tone={tone} aria-hidden="true">
                    {tone === 'neutral' ? null : (
                      <Icon name={tone === 'warn' ? 'alert' : 'check'} size="sm" />
                    )}
                  </span>
                  <span className="min-w-0">
                    {labels[id]}
                    {extra ? <small>{extra}</small> : null}
                  </span>
                  <b className="rx-ncheck__pct" data-tone={tone}>
                    {c.pass + c.fail > 0 ? formatPercent(c.pass / known, 1) : '–'}
                  </b>
                  <span className="rx-ncheck__out" data-dkg-check={id}>
                    {c.fail > 0 ? (
                      <Link to="/masternodes" search={{ dkg: [id], ...ENABLED }}>
                        {t`${formatInt(c.fail)} fail`}
                      </Link>
                    ) : (
                      t`none fail`
                    )}
                    {c.unknown > 0 ? t`, ${formatInt(c.unknown)} unknown` : null}
                  </span>
                </li>
              )
            })}
          </ul>
          {d.version_only || d.beyond_version ? (
            <p className="rx-nfoot">
              {d.version_only
                ? t`${formatInt(d.version_only)} fail only the version check and need just the upgrade. `
                : null}
              {d.beyond_version
                ? t`${formatInt(d.beyond_version)} fail a check that upgrading alone won’t fix.`
                : null}
            </p>
          ) : null}
        </div>
      ) : null}
    </Card>
  )
}

/** The median annual yield of regular masternodes and evonodes, drawn on one scale; how it is measured on demand. */
export function YieldsCard({ summary }: SectionProps) {
  const { t } = useLingui()
  const colors = useCensusColors()
  const r = summary.data?.data.returns
  const regular = r?.regular?.median_annual_yield
  const evo = r?.evo?.median_annual_yield
  if (summary.data && regular == null && evo == null) return null
  const total = r?.evo?.median_total_yield
  const platform = r?.evo?.median_platform_yield
  const split = total != null && evo != null && platform != null
  const pct = (v: number | null | undefined) => (v == null ? '–' : t`${formatPercent(v, 1)} a year`)
  const evoShown = total ?? evo
  const scale = Math.max(regular ?? 0, evoShown ?? 0) * 1.1 || 1
  const core = swatchOf(colors, colors.rank[0]!)
  const bar = (v: number) => (
    <span className="rx-nyield__bar" aria-hidden="true">
      <i style={{ width: `${String((v / scale) * 100)}%`, background: core }} />
    </span>
  )
  return (
    <Card
      level="section"
      title={t`What they earn`}
      id="yields"
      layer="network"
      subtitle={
        r ? (
          <>
            {t`Median annual yield, last ${String(r.window_days)} days`}{' '}
            <InfoTip label={t`How the yield is measured`}>
              <p className="m-0">
                {t`What masternodes were actually paid over the last ${String(r.window_days)} days, against their collateral, counting every enabled masternode registered for at least that long.`}
              </p>
            </InfoTip>
          </>
        ) : undefined
      }
      source={stampsOf(summary.data)}
      state={loadState(summary)}
      error={summary.error}
      onRetry={() => void summary.refetch()}
    >
      {r ? (
        <ul className="rx-nyield" data-yields>
          <li data-yield="regular">
            <span className="rx-nyield__head">
              <span>{t`Regular masternodes`}</span>
              <span className="rx-nyield__value">{pct(regular)}</span>
              <span className="rx-nyield__note">
                {t`median of ${formatInt(r.regular?.masternodes ?? 0)}, on 1,000 DASH`}
              </span>
            </span>
            {regular != null ? bar(regular) : null}
          </li>
          <li data-yield="evo">
            <span className="rx-nyield__head">
              <span>{t`Evonodes`}</span>
              <span className="rx-nyield__value">{pct(evoShown)}</span>
              <span className="rx-nyield__note">
                {total != null
                  ? t`median of ${formatInt(r.evo?.masternodes ?? 0)}, on 4,000 DASH`
                  : t`median of ${formatInt(r.evo?.masternodes ?? 0)}, on 4,000 DASH; Core payments only, Platform rewards aren't counted`}
              </span>
            </span>
            {evoShown != null ? bar(evoShown) : null}
            {split ? (
              <p className="rx-nyield__note m-0" data-yield-split>
                {t`Core payments`} <b>{pct(evo)}</b> · {t`Platform rewards`} <b>{pct(platform)}</b>
                {r.evo?.platform_span_days != null
                  ? `, ${t`from ${String(Math.round(r.evo.platform_span_days))} days of epochs`}`
                  : null}
              </p>
            ) : null}
          </li>
        </ul>
      ) : null}
    </Card>
  )
}

/** Evonode Platform health: the latest check of every evonode's Platform endpoints. */
export function PlatformHealthCard({ summary }: SectionProps) {
  const { t } = useLingui()
  const colors = useCensusColors()
  const p = summary.data?.data.platform
  if (summary.data && !p?.checked) return null
  const versions = (rows: readonly (readonly [string, number])[]) => {
    const named = rows.filter(([k]) => k !== 'Unknown').map(([k]) => k)
    return rows.map(([k, n]) => ({
      key: k,
      name: k === 'Unknown' ? t`No answer` : k,
      n,
      color: k === 'Unknown' ? colors.unknown : (colors.rank[named.indexOf(k)] ?? colors.other),
    }))
  }
  const healthy = p ? p.healthy / p.checked : undefined
  return (
    <Card
      level="section"
      title={t`Evonode Platform health`}
      id="platform"
      layer="platform"
      source={stampsOf(summary.data)}
      state={loadState(summary)}
      error={summary.error}
      onRetry={() => void summary.refetch()}
    >
      {p ? (
        <div className="grid gap-5" data-platform-health>
          <Answer
            tone={healthy !== undefined && healthy >= 0.95 ? 'good' : 'warn'}
            pill={t`${formatInt(p.healthy)} of ${formatInt(p.checked)} healthy`}
          >
            <span className="rx-nanswer__line">
              {t`Updated`} <Time ms={p.updated} mode="relative" live />
            </span>
            <InfoTip label={t`What healthy means`}>
              <p className="m-0">
                {t`${formatPercent(p.healthy / p.checked, 1)} of ${formatInt(p.checked)} enabled evonodes passed our latest Platform check: their Tenderdash P2P port was open and their DAPI answered over valid TLS.`}{' '}
                {t`Checked every 15 minutes, last`} <Time ms={p.updated} mode="relative" live />.
              </p>
            </InfoTip>
          </Answer>
          <FigureGrid tight>
            <Figure label={t`DAPI answered`} value={formatInt(p.https_ok)} />
            <Figure label={t`Tenderdash P2P open`} value={formatInt(p.p2p_ok)} />
            <Figure
              label={t`Platform height`}
              value={p.max_height != null ? formatInt(p.max_height) : '–'}
              note={t`highest seen`}
            />
          </FigureGrid>
          {(
            [
              ['drive', t`Drive versions`, p.drive],
              ['tenderdash', t`Tenderdash versions`, p.tenderdash],
            ] as const
          ).map(([key, title, rows]) => (
            <div key={key} className="grid gap-1" data-platform-versions={key}>
              <h3 className="rx-nsub">{title}</h3>
              <SegBar label={title} legend="share" parts={versions(rows)} />
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  )
}

/** Speed tests: one grade bar per test location, hidden only when no tests exist. */
export function SpeedCard({ census }: SectionProps & { census: Census }) {
  const { t } = useLingui()
  const colors = useCensusColors()
  const vantages = (census.bench.data?.data.vantages ?? []).filter((v) => v.tested > 0)
  if (census.bench.data ? vantages.length === 0 : census.bench.isError) return null
  const tones: Record<string, string> = {
    A: colors.good,
    B: colors.rank[2]!,
    C: colors.rank[3]!,
    D: colors.rank[1]!,
    F: colors.bad,
  }
  const scores = vantages.flatMap((v) => v.scores.filter((s): s is number => s !== null))
  const runs = scores.length + vantages.reduce((a, v) => a + v.failed, 0)
  const goodShare = runs > 0 ? scores.filter((s) => s >= 75).length / runs : 0
  const speedTone = shareTone(goodShare)
  // The speed tests run every two weeks: their time is said on the card, not taken for the crawl's on the page line.
  return (
    <NoSourceSection>
      <Card
        level="section"
        title={t`How fast they serve`}
        id="speed"
        layer="network"
        source={stampsOf(census.bench.data)}
        state={loadState(census.bench)}
        error={census.bench.error}
        onRetry={() => void census.bench.refetch()}
      >
        <div className="grid gap-5" data-speed>
          {runs > 0 ? (
            <Answer
              tone={speedTone === 'bad' ? 'warn' : speedTone}
              pill={t`${formatPercent(goodShare, 0)} A or B`}
            >
              <InfoTip label={t`How the speed is tested`}>
                <p className="m-0">
                  {t`Once every two weeks we download the latest 50,000 headers and the masternode list from every enabled masternode. ${formatPercent(goodShare, 0)} of the latest tests earned an A or B.`}
                </p>
              </InfoTip>
            </Answer>
          ) : null}
          <ul className="rx-nspeed">
            {vantages.map((v) => {
              const parts = [
                ...GRADES.map((g) => ({
                  key: g,
                  name: g,
                  n: v.grades[g] ?? 0,
                  color: tones[g]!,
                })),
                { key: 'failed', name: t`No answer`, n: v.failed, color: colors.unknown },
              ]
              return (
                <li key={v.vantage} data-vantage={v.vantage}>
                  <span className="rx-nspeed__head">
                    <b>{v.location || v.vantage}</b>
                    <span>
                      {t`${formatInt(v.tested)} tested · median ${formatInt(Math.round(median(v.headers_per_sec) ?? 0))} headers/s · ping ${formatInt(Math.round(median(v.ping_ms) ?? 0))} ms`}
                    </span>
                  </span>
                  <SegBar
                    label={t`Speed-test grades, ${v.location || v.vantage}`}
                    legend="share"
                    parts={parts}
                  />
                </li>
              )
            })}
          </ul>
        </div>
      </Card>
    </NoSourceSection>
  )
}
