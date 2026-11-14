import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useDecentralizedOnly } from '@/data/health'
import { mnRowsQuery, type MnRow } from '@/data/masternodes/rows'
import { PageFrame, useNetwork } from '@/features/entity'
import { formatInt } from '@/lib/format'
import { Empty, ErrorState, SegFilter, Skeleton, Unavailable } from '@/ui'
import { ListActions, ListView, useMnMatches } from './ListView'
import { PlatformView } from './PlatformView'
import { useMnSearch } from './use-mn-search'

export function MasternodesPage() {
  const { t } = useLingui()
  const net = useNetwork()
  const controls = useMnSearch()
  const { search } = controls
  const mode = useDecentralizedOnly()
  const list = useQuery(mnRowsQuery(net))
  const data = list.data?.data
  const crawl = data?.radar != null && data.rows.some((r) => r.crawl)
  const stamps = useMemo(
    () => (data ? [data.dapi, data.radar].flatMap((s) => (s ? [s] : [])) : []),
    [data],
  )
  const matches = useMnMatches(data?.rows, search)
  const listed = data !== undefined && data.rows.length > 0

  return (
    <PageFrame
      path="/masternodes"
      title={t`Masternodes`}
      claim={listed ? <Claim rows={data.rows} /> : undefined}
      eyebrow={t`Network`}
      layer="network"
      lede={t`Every masternode and evonode, and whether it answers.`}
      actions={
        <div className="rx-page__actions">
          <SegFilter
            label={t`View`}
            value={search.view}
            onChange={(view) => {
              controls.sort({ view: view as 'list' | 'platform', sort: undefined, pf: undefined })
            }}
            options={[
              { id: 'list', label: t`Masternodes` },
              { id: 'platform', label: t`Evonodes on Platform` },
            ]}
          />
          {listed && search.view === 'list' ? (
            <ListActions data={data} net={net} search={search} matches={matches} />
          ) : null}
        </div>
      }
    >
      <div className="rx-mnlist">
        {data && !crawl ? (
          mode ? (
            <Unavailable
              compact
              source="radar"
              title={t`Country, hosting, version, uptime, payments and readiness need Radar’s crawl`}
            />
          ) : (
            <p className="rx-note" data-crawl-missing>
              {t`Radar’s crawl did not answer, so country, hosting, version, uptime, payments and readiness are missing. DAPI’s list is shown.`}
            </p>
          )
        ) : null}
        {list.isPending ? (
          <Skeleton shape="row" count={8} />
        ) : list.isError || !data ? (
          <ErrorState error={list.error} onRetry={() => void list.refetch()} />
        ) : data.rows.length === 0 ? (
          <Empty kind="none-yet" title={t`No masternodes yet`} />
        ) : search.view === 'platform' ? (
          <PlatformView data={data} net={net} controls={controls} indexers={!mode} />
        ) : (
          <ListView data={data} controls={controls} matches={matches} stamps={stamps} />
        )}
      </div>
    </PageFrame>
  )
}

/**
 * The page's headline. With a crawl of every enabled masternode it is how many of them answered; with DAPI's list
 * alone, or a crawl that has not reached them all, it is how many of the registered ones are enabled.
 */
function Claim({ rows }: { rows: readonly MnRow[] }) {
  const { t } = useLingui()
  let enabled = 0
  let answering = 0
  let unknown = 0
  for (const r of rows) {
    if (r.status !== 'enabled') continue
    enabled++
    if (r.crawl?.reachable === true) answering++
    else if (r.crawl?.reachable !== false) unknown++
  }
  return (
    <span data-mn-claim={unknown === 0 ? 'answering' : 'enabled'}>
      {unknown === 0
        ? t`${formatInt(answering)} of ${formatInt(enabled)} enabled masternodes answered the last crawl`
        : t`${formatInt(enabled)} of ${formatInt(rows.length)} masternodes are enabled`}
    </span>
  )
}
