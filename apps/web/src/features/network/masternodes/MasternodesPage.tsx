import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useDecentralizedOnly } from '@/data/health'
import { mnRowsQuery } from '@/data/masternodes/rows'
import { PageFrame, useNetwork } from '@/features/entity'
import { formatInt } from '@/lib/format'
import { Empty, ErrorState, SegFilter, Skeleton, Unavailable } from '@/ui'
import { ListView } from './ListView'
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

  return (
    <PageFrame
      path="/masternodes"
      title={t`Masternodes`}
      eyebrow={t`Network`}
      layer="network"
      lede={
        data
          ? t`${formatInt(data.rows.length)} masternodes and evonodes on ${net}.`
          : t`Every masternode and evonode, and whether it answers.`
      }
    >
      <div className="grid min-w-0 gap-4">
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
          <ListView data={data} net={net} controls={controls} stamps={stamps} />
        )}
      </div>
    </PageFrame>
  )
}
