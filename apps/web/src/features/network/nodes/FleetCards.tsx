import { useLingui } from '@lingui/react/macro'
import { Link } from '@tanstack/react-router'
import { formatInt, formatPercent } from '@/lib/format'
import { Card, Time } from '@/ui'
import { useCensusColors } from './census-colors'
import type { Census } from './census-data'
import { DKG_CHECK_IDS, GRADES, median } from './census-math'
import { Figure, FigureGrid, ShareBar } from './parts'
import { loadState, stampsOf, type SectionProps } from './shared'

const ENABLED = { status: ['enabled' as const] }

/** Core 24 quorum readiness: how many enabled masternodes pass each DKG connection check, with links to the failures. */
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
  const protocolCounts = d?.rules?.protocol_check !== false
  const ready = (n: number) => (d && d.masternodes > 0 ? formatPercent(n / d.masternodes, 1) : '–')
  const checks = d
    ? DKG_CHECK_IDS.filter((id) => {
        const c = d.checks[id]
        return c && c.pass + c.fail + c.unknown > 0 && (id !== 'protocol' || protocolCounts)
      })
    : []
  return (
    <Card
      title={t`Ready for ${release} quorums`}
      id="readiness"
      layer="network"
      subtitle={
        d
          ? t`${ready(d.overall.pass)} of ${formatInt(d.masternodes)} enabled masternodes pass every check.`
          : undefined
      }
      source={stampsOf(summary.data)}
      state={loadState(summary)}
      error={summary.error}
      onRetry={() => void summary.refetch()}
    >
      {d ? (
        <div className="grid gap-4" data-readiness>
          <FigureGrid columns={3}>
            <Figure
              label={t`Pass every check`}
              value={ready(d.overall.pass)}
              tone={d.overall.pass === d.masternodes ? 'good' : undefined}
              note={
                <>
                  {d.overall.pass > 0 ? (
                    <Link to="/masternodes" search={{ dkg: ['ready'], ...ENABLED }}>
                      {t`${formatInt(d.overall.pass)} ready`}
                    </Link>
                  ) : (
                    t`0 ready`
                  )}
                  {d.overall.unknown > 0 ? t`, ${formatInt(d.overall.unknown)} unknown` : null}
                </>
              }
            />
            {checks.map((id) => {
              const c = d.checks[id]!
              const known = c.pass + c.fail + c.unknown
              const extra =
                id === 'protocol' && minProtocol !== undefined
                  ? t`needs ${String(minProtocol)}+`
                  : id === 'platform_ban'
                    ? t`evonodes only`
                    : undefined
              return (
                <Figure
                  key={id}
                  label={labels[id]}
                  value={c.pass + c.fail > 0 ? formatPercent(c.pass / known, 1) : '–'}
                  tone={c.fail > 0 ? 'warn' : c.pass > 0 ? 'good' : undefined}
                  note={
                    <span data-dkg-check={id} className="[&_a]:underline">
                      {c.fail > 0 ? (
                        <Link to="/masternodes" search={{ dkg: [id], ...ENABLED }}>
                          {t`${formatInt(c.fail)} fail`}
                        </Link>
                      ) : (
                        t`none fail`
                      )}
                      {c.unknown > 0 ? t`, ${formatInt(c.unknown)} unknown` : null}
                      {extra ? ` · ${extra}` : null}
                    </span>
                  }
                />
              )
            })}
          </FigureGrid>
          {d.version_only || d.beyond_version ? (
            <p className="text-sm text-[var(--dh-ink-2)]">
              {d.version_only
                ? t`${formatInt(d.version_only)} fail only the version check and need just the upgrade. `
                : null}
              {d.beyond_version
                ? t`${formatInt(d.beyond_version)} fail another check that needs a fix.`
                : null}
            </p>
          ) : null}
        </div>
      ) : null}
    </Card>
  )
}

/** The median annual yield of regular masternodes and evonodes, and how it is measured. */
export function YieldsCard({ summary }: SectionProps) {
  const { t } = useLingui()
  const r = summary.data?.data.returns
  const regular = r?.regular?.median_annual_yield
  const evo = r?.evo?.median_annual_yield
  if (summary.data && regular == null && evo == null) return null
  const total = r?.evo?.median_total_yield
  const pct = (v: number | null | undefined) => (v == null ? '–' : t`${formatPercent(v, 1)} a year`)
  return (
    <Card
      title={t`What they earn`}
      id="yields"
      layer="network"
      subtitle={
        r
          ? t`What masternodes were actually paid over the last ${String(r.window_days)} days, against their collateral, counting every enabled masternode registered for at least that long.`
          : undefined
      }
      source={stampsOf(summary.data)}
      state={loadState(summary)}
      error={summary.error}
      onRetry={() => void summary.refetch()}
    >
      {r ? (
        <div className="grid gap-3" data-yields>
          <FigureGrid columns={2}>
            <Figure
              label={t`Regular masternodes`}
              value={pct(regular)}
              note={t`median of ${formatInt(r.regular?.masternodes ?? 0)}, on 1,000 DASH`}
            />
            <Figure
              label={t`Evonodes`}
              value={pct(total ?? evo)}
              note={
                total != null
                  ? t`median of ${formatInt(r.evo?.masternodes ?? 0)}, on 4,000 DASH, Core payments and Platform rewards together`
                  : t`median of ${formatInt(r.evo?.masternodes ?? 0)}, on 4,000 DASH; Core payments only, Platform rewards aren't counted`
              }
            />
            {total != null ? (
              <Figure
                label={t`Evonodes, Core payments`}
                value={pct(evo)}
                note={t`median, from the Core blocks that paid them`}
              />
            ) : null}
            {total != null && r.evo?.median_platform_yield != null ? (
              <Figure
                label={t`Evonodes, Platform rewards`}
                value={pct(r.evo.median_platform_yield)}
                note={t`median, from the Platform epochs of the last ${String(Math.round(r.evo.platform_span_days ?? 0))} days`}
              />
            ) : null}
          </FigureGrid>
        </div>
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
  const versions = (rows: readonly (readonly [string, number])[]) =>
    rows.map(([k, n], i) => ({
      key: k,
      name: k === 'Unknown' ? t`No answer` : k,
      n,
      color: k === 'Unknown' ? colors.axis : (colors.rank[i] ?? colors.other),
    }))
  return (
    <Card
      title={t`Evonode Platform health`}
      id="platform"
      layer="network"
      subtitle={
        p
          ? t`${formatPercent(p.healthy / p.checked, 1)} of ${formatInt(p.checked)} enabled evonodes passed our latest Platform check: their Tenderdash P2P port was open and their DAPI answered over valid TLS.`
          : undefined
      }
      source={stampsOf(summary.data)}
      state={loadState(summary)}
      error={summary.error}
      onRetry={() => void summary.refetch()}
    >
      {p ? (
        <div className="grid gap-4" data-platform-health>
          <FigureGrid columns={4}>
            <Figure
              label={t`Healthy`}
              value={t`${formatInt(p.healthy)} of ${formatInt(p.checked)}`}
              tone={p.healthy / p.checked >= 0.95 ? 'good' : 'warn'}
            />
            <Figure label={t`DAPI answered`} value={formatInt(p.https_ok)} />
            <Figure label={t`Tenderdash P2P open`} value={formatInt(p.p2p_ok)} />
            <Figure
              label={t`Platform height`}
              value={p.max_height != null ? formatInt(p.max_height) : '–'}
              note={t`highest seen`}
            />
          </FigureGrid>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2" data-platform-versions="drive">
              <h4 className="font-semibold">{t`Drive versions`}</h4>
              <ShareBar parts={versions(p.drive)} label={t`Drive versions`} />
            </div>
            <div className="grid gap-2" data-platform-versions="tenderdash">
              <h4 className="font-semibold">{t`Tenderdash versions`}</h4>
              <ShareBar parts={versions(p.tenderdash)} label={t`Tenderdash versions`} />
            </div>
          </div>
          <p className="text-sm text-[var(--dh-ink-2)]">
            {t`Checked every 15 minutes, last`} <Time ms={p.updated} mode="relative" live />.
          </p>
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
    C: colors.warn,
    D: colors.bad,
    F: colors.bad,
    failed: colors.axis,
  }
  const scores = vantages.flatMap((v) => v.scores.filter((s): s is number => s !== null))
  const runs = scores.length + vantages.reduce((a, v) => a + v.failed, 0)
  const good = scores.filter((s) => s >= 75).length
  return (
    <Card
      title={t`How fast they serve`}
      id="speed"
      layer="network"
      subtitle={
        runs > 0
          ? t`Once every two weeks we download the latest 50,000 headers and the masternode list from every enabled masternode. ${formatPercent(good / runs, 0)} of the latest tests earned an A or B.`
          : undefined
      }
      source={stampsOf(census.bench.data)}
      state={loadState(census.bench)}
      error={census.bench.error}
      onRetry={() => void census.bench.refetch()}
    >
      <div className="grid gap-5 md:grid-cols-2" data-speed>
        {vantages.map((v) => {
          const parts = [
            ...GRADES.map((g) => ({
              key: g,
              name: t`Grade ${g}`,
              n: v.grades[g] ?? 0,
              color: tones[g]!,
            })),
            { key: 'failed', name: t`Didn't answer`, n: v.failed, color: tones.failed! },
          ].filter((p) => p.n > 0)
          return (
            <div key={v.vantage} className="grid gap-2" data-vantage={v.vantage}>
              <h4 className="font-semibold">{v.location || v.vantage}</h4>
              <ShareBar parts={parts} label={v.location || v.vantage} />
              <p className="text-sm text-[var(--dh-ink-2)]">
                {t`${formatInt(v.tested)} tested this cycle. Median ${formatInt(Math.round(median(v.headers_per_sec) ?? 0))} headers/s, ping ${formatInt(Math.round(median(v.ping_ms) ?? 0))} ms.`}{' '}
                {t`Updated`} <Time ms={v.updated} mode="relative" live />.
              </p>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
