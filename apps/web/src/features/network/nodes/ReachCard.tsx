import { useLingui } from '@lingui/react/macro'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { formatInt } from '@/lib/format'
import { Card, Chart, Empty, Skeleton } from '@/ui'
import { sizeOption, type Series } from './census-charts'
import { useCensusColors } from './census-colors'
import type { Census } from './census-data'
import { dayMonth, dayMonthTime } from './census-format'
import { radarScope, reachShare, total } from './census-math'
import { ScrollRegion, ShareBar, useShareText } from './parts'
import { SCOPE_NOUN } from './scope-text'
import { loadState, stampsOf, type SectionProps } from './shared'

export function ReachCard({ scope, summary, census }: SectionProps & { census: Census }) {
  const { t, i18n } = useLingui()
  const colors = useCensusColors()
  const share = useShareText()
  const data = summary.data?.data
  const dist = data?.dists[radarScope(scope)] ?? {}
  const reach = reachShare(dist.reachable)
  const noun = i18n._(SCOPE_NOUN[scope])
  const parts = [
    { key: 'yes', name: t`Answered`, n: reach.yes, color: colors.good },
    { key: 'no', name: t`Didn't answer`, n: reach.no, color: colors.bad },
    { key: 'unchecked', name: t`Not checked`, n: reach.unchecked, color: colors.axis },
  ].filter((p) => p.n > 0)
  const crawl = data?.crawl
  const lede =
    scope === 'other'
      ? t`${formatInt(total(dist.version ?? []))} other full nodes accept connections. Nodes that only connect out can't be seen from outside, so the real number is higher.`
      : scope === 'all'
        ? crawl
          ? t`${formatInt(crawl.reachable)} nodes answered out of ${formatInt(crawl.tried)} addresses tried. Counted are nodes that answered at least once this week, plus every enabled masternode.`
          : undefined
        : reach.yes + reach.no > 0
          ? t`${share(reach.yes, reach.yes + reach.no)} of enabled ${noun} answered our handshake on their registered address; ${formatInt(reach.no)} didn't.`
          : undefined
  const names: Record<string, string> = {
    ipv4: t`IPv4`,
    ipv6: t`IPv6`,
    onion: t`Tor`,
    i2p: t`I2P`,
    cjdns: t`CJDNS`,
  }

  return (
    <Card
      title={t`Can they be reached`}
      id="reach"
      layer="network"
      subtitle={lede}
      source={stampsOf(summary.data, census.size.data)}
      state={loadState(summary)}
      error={summary.error}
      onRetry={() => void summary.refetch()}
    >
      <div className="grid min-w-0 gap-6 [&>*]:min-w-0">
        <div className="grid gap-2">
          {parts.length > 0 ? <ShareBar parts={parts} label={t`Reachability`} /> : null}
          {reach.no > 0 && scope !== 'all' && scope !== 'other' ? (
            <p>
              <Link
                to="/masternodes"
                search={{
                  reach: 'unreachable',
                  ...(scope === 'evo' ? { type: ['evo' as const] } : {}),
                }}
              >
                {t`See which`}
              </Link>
            </p>
          ) : null}
        </div>
        {data && data.networks.length > 0 ? (
          <ScrollRegion label={t`Address networks`} data-address-networks>
            <table className="dh-table dh-table--compact">
              <caption className="text-left font-semibold">{t`Address networks`}</caption>
              <thead>
                <tr>
                  <th scope="col">{t`Network`}</th>
                  <th scope="col" className="text-right">
                    {t`Known addresses`}
                  </th>
                  <th scope="col" className="text-right">
                    {t`Reachable now`}
                  </th>
                  <th scope="col" className="text-right">
                    {t`Masternodes`}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.networks.map((n) => (
                  <tr key={n.network} data-network={n.network}>
                    <th scope="row" className="font-normal">
                      {names[n.network] ?? n.network}
                    </th>
                    <td className="text-right tabular-nums">{formatInt(n.known)}</td>
                    {n.crawled ? (
                      <td className="text-right tabular-nums">{formatInt(n.reachable)}</td>
                    ) : (
                      <td className="text-right text-[var(--dh-ink-2)]" title={n.reason ?? ''}>
                        {n.reason ? t`not crawled: ${n.reason}` : t`not crawled`}
                      </td>
                    )}
                    <td className="text-right tabular-nums">
                      {n.crawled ? formatInt(n.masternodes) : '–'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollRegion>
        ) : null}
        <SizeChart census={census} />
      </div>
    </Card>
  )
}

function SizeChart({ census }: { census: Census }) {
  const { t } = useLingui()
  const colors = useCensusColors()
  const [cursor, setCursor] = useState<number>()
  const doc = census.size.data?.data
  const labels: Record<string, string> = {
    reachable_nodes: t`Reachable nodes`,
    masternodes: t`Enabled masternodes`,
    masternodes_reachable: t`Masternodes reachable`,
  }
  const tones = [colors.rank[0]!, colors.rank[2]!, colors.good]
  const series: Series[] = (doc?.series ?? []).map((s, i) => ({
    key: s.key,
    name: labels[s.key] ?? s.key,
    color: tones[i % tones.length]!,
    values: s.values,
  }))
  const count = doc?.t.length ?? 0

  const readout =
    cursor === undefined || !doc
      ? t`Focus the chart and press the arrow keys to read a point.`
      : `${dayMonthTime(doc.t[cursor]!)}: ${series
          .map((s) => `${s.name} ${formatInt(Math.round(s.values[cursor] ?? 0))}`)
          .join(' · ')}`

  if (census.size.isError)
    return <Empty kind="blocked" title={t`The network size history didn't load.`} />
  if (!doc) return <Skeleton shape="chart" height={220} />
  const at = cursor ?? Math.max(0, count - 1)
  return (
    <div className="grid min-w-0 gap-2" data-size-chart>
      <h4 className="font-semibold">{t`Network size`}</h4>
      <Chart
        option={sizeOption(doc, series, cursor, colors.warn)}
        height={220}
        label={t`Network size over time`}
        table={{
          columns: [t`Series`, dayMonth(doc.t[0]!), dayMonth(doc.t[count - 1]!)],
          rows: series.map((s) => [
            s.name,
            formatInt(Math.round(s.values[0] ?? 0)),
            formatInt(Math.round(s.values[count - 1] ?? 0)),
          ]),
        }}
      />
      <input
        type="range"
        className="w-full accent-[var(--dh-focus)]"
        min={0}
        max={Math.max(0, count - 1)}
        step={1}
        value={at}
        aria-label={t`Network size. Use the left and right arrow keys to step through the points.`}
        aria-valuetext={readout}
        onChange={(e) => {
          setCursor(Number(e.target.value))
        }}
        onFocus={() => {
          setCursor((c) => c ?? Math.max(0, count - 1))
        }}
        onBlur={() => {
          setCursor(undefined)
        }}
      />
      <p className="min-h-5 text-sm text-[var(--dh-ink-2)]" aria-live="polite" data-size-readout>
        {readout}
      </p>
    </div>
  )
}
