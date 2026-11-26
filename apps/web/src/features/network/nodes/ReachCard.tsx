import { plural } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { formatInt } from '@/lib/format'
import { Card, Chart, Empty, Skeleton, stampsOf } from '@/ui'
import { sizeOption, type Series } from './census-charts'
import { useCensusColors } from './census-colors'
import type { Census } from './census-data'
import { unreachableLink } from './census-links'
import { dayMonthTime } from './census-format'
import { fraction, radarScope, reachShare, total } from './census-math'
import { InfoTip } from '../v24/InfoTip'
import { Answer, SegBar, shareTone } from './bars'
import { useShareText } from './parts'
import { SCOPE_NOUN } from './scope-text'
import { loadState, type SectionProps } from './shared'

export function ReachCard({ scope, summary, census }: SectionProps & { census: Census }) {
  const { t, i18n } = useLingui()
  const colors = useCensusColors()
  const share = useShareText()
  const data = summary.data?.data
  const dist = data?.dists[radarScope(scope)] ?? {}
  const reach = reachShare(dist.reachable)
  const noun = i18n._(SCOPE_NOUN[scope])
  const crawl = data?.crawl
  const names: Record<string, string> = {
    ipv4: t`IPv4`,
    ipv6: t`IPv6`,
    onion: t`Tor`,
    i2p: t`I2P`,
    cjdns: t`CJDNS`,
  }
  const answered = reach.yes + reach.no > 0 ? { n: reach.yes, of: reach.yes + reach.no } : undefined
  const about =
    scope === 'other'
      ? t`Other full nodes accept connections at ${formatInt(total(dist.version ?? []))} addresses. A node reachable on several networks counts at each, and nodes that only connect out can't be seen from outside.`
      : scope === 'all'
        ? undefined
        : answered
          ? t`${share(answered.n, answered.of)} of enabled ${noun} answered our handshake on their registered address; ${formatInt(reach.no)} didn't.`
          : undefined
  const parts = [
    { key: 'yes', name: t`Answered`, n: reach.yes, color: colors.good },
    { key: 'no', name: t`Didn't answer`, n: reach.no, color: colors.bad },
    { key: 'unchecked', name: t`Not checked`, n: reach.unchecked, color: colors.unknown },
  ]
  const seeWhich =
    reach.no > 0 && scope !== 'all' && scope !== 'other' ? (
      <Link to="/masternodes" search={unreachableLink(scope)}>
        {t`See which`}
      </Link>
    ) : undefined

  return (
    <Card
      level="section"
      title={t`Can they be reached`}
      id="reach"
      layer="network"
      subtitle={
        scope === 'all'
          ? t`Addresses that answered this week, plus every enabled masternode’s`
          : scope === 'other'
            ? t`Addresses that accept connections`
            : t`Enabled ${noun}`
      }
      source={stampsOf(summary.data, census.size.data)}
      state={loadState(summary)}
      error={summary.error}
      onRetry={() => void summary.refetch()}
    >
      <div className="grid min-w-0 gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <div className="grid content-start gap-5">
          {answered ? (
            <Answer
              tone={scope === 'all' ? 'neutral' : shareTone(answered.n / answered.of)}
              pill={
                scope === 'all' || scope === 'other'
                  ? t`${share(answered.n, answered.of)} answered the last crawl`
                  : t`${share(answered.n, answered.of)} of enabled ${noun} answered`
              }
            >
              <span className="rx-nanswer__line">
                {scope === 'all' && crawl
                  ? t`${formatInt(answered.n)} of ${formatInt(answered.of)} · ${formatInt(crawl.tried)} tried in the last crawl`
                  : t`${formatInt(answered.n)} of ${formatInt(answered.of)}`}
              </span>
              {about ? (
                <InfoTip label={t`Who is counted`}>
                  <p className="m-0">{about}</p>
                </InfoTip>
              ) : null}
            </Answer>
          ) : about ? (
            <p className="rx-nfoot">{about}</p>
          ) : null}
          <SegBar label={t`Reachability`} legend="share" parts={parts} extra={seeWhich} />
          {data && data.networks.length > 0 ? (
            <div data-address-networks>
              <h3 className="rx-nsub">{t`Address networks`}</h3>
              <ul className="rx-nnets">
                {data.networks.map((n) => (
                  <li key={n.network} data-network={n.network} data-crawled={String(n.crawled)}>
                    <span className="rx-nnets__name">{names[n.network] ?? n.network}</span>
                    {n.crawled ? (
                      <>
                        <span className="rx-nnets__value">
                          {formatInt(n.reachable)}{' '}
                          <small>{t`reachable of ${formatInt(n.known)} known`}</small>
                        </span>
                        <span className="rx-nnets__meter" aria-hidden="true">
                          <i
                            style={{ width: `${String(fraction(n.reachable, n.known) * 100)}%` }}
                          />
                        </span>
                        <span className="rx-nnets__note">
                          {plural(n.masternodes, {
                            one: '# masternode answering',
                            other: '# masternodes answering',
                          })}
                        </span>
                      </>
                    ) : (
                      <span className="rx-nnets__note" title={n.reason ?? ''}>
                        {n.reason ? t`not crawled: ${n.reason}` : t`not crawled`}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              <p className="rx-nfoot" data-networks-note>
                {t`Masternodes answering counts registered masternodes, PoSe-banned included, that answered on an address of that network; one that answers on two networks counts in both.`}
              </p>
            </div>
          ) : null}
        </div>
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
    reachable_nodes: t`Reachable addresses`,
    masternodes: t`Enabled masternodes`,
    masternodes_reachable: t`Masternodes reachable`,
  }
  const tones = [colors.rank[0]!, colors.rank[3]!, colors.good]
  const series: Series[] = (doc?.series ?? []).map((s, i) => ({
    key: s.key,
    name: labels[s.key] ?? s.key,
    color: tones[i % tones.length]!,
    values: s.values,
  }))
  const count = doc?.t.length ?? 0

  const readout =
    cursor === undefined || !doc
      ? t`Drag the slider or press the arrow keys to read a point.`
      : `${dayMonthTime(doc.t[cursor]!)}: ${series
          .map((s) => `${s.name} ${formatInt(Math.round(s.values[cursor] ?? 0))}`)
          .join(' · ')}`

  if (census.size.isError)
    return <Empty kind="blocked" title={t`The network size history didn't load.`} />
  if (!doc) return <Skeleton shape="chart" height={220} />
  const at = cursor ?? Math.max(0, count - 1)
  return (
    <div className="relative grid min-w-0 content-start gap-2" data-size-chart>
      <div className="rx-nsub">
        <h3>{t`Network size`}</h3>
        <InfoTip label={t`About the network size`}>
          <p className="m-0" data-size-note>
            {t`Reachable addresses are addresses, not nodes: a node doesn’t tell peers its addresses on other networks, so one reachable on IPv4 and Tor counts twice. Masternodes are counted by their registration, so each counts once.`}
          </p>
        </InfoTip>
      </div>
      <Chart
        option={sizeOption(doc, series, cursor, colors.warn)}
        height={220}
        label={t`Network size over time`}
        table={{
          columns: [t`Series`, dayMonthTime(doc.t[0]!), dayMonthTime(doc.t[count - 1]!)],
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
      />
      <p className="min-h-5 text-sm text-[var(--dh-ink-2)]" aria-live="polite" data-size-readout>
        {readout}
      </p>
    </div>
  )
}
