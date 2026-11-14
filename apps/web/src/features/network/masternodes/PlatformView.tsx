import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { stampOf, type SourceStamp } from '@/data/envelope'
import {
  buildEvoRows,
  evoFilterCounts,
  filterEvoRows,
  sortEvoRows,
  type PlatformFilter,
} from '@/data/masternodes/platform'
import type { MnRows } from '@/data/masternodes/rows'
import { peQueries } from '@/data/pe/queries'
import { radarQueries } from '@/data/radar/queries'
import { platformTipQuery, sdkQueries } from '@/data/sdk/queries'
import { formatInt } from '@/lib/format'
import type { NetworkId } from '@/lib/network'
import { ActiveFilters, DataTable, Empty, SearchField, SegFilter, TableTools } from '@/ui'
import { useDebouncedQuery } from '../debounced-query'
import { useEvoColumns } from './evo-columns'
import { SortPicker, sortOptionsOf } from './FilterBar'
import { mnPageLink, type MnSearchControls } from './use-mn-search'

const EVO_PAGE_SIZE = 50
/** One SDK call proves at most this many evonodes. */
const SDK_BATCH = 100

export interface PlatformViewProps {
  data: MnRows
  net: NetworkId
  controls: MnSearchControls
  /** Radar's Platform record and Platform Explorer's validators may be asked. */
  indexers: boolean
}

export function PlatformView({ data, net, controls, indexers }: PlatformViewProps) {
  const { t } = useLingui()
  const { search } = controls
  const platform = useQuery({ ...radarQueries.platform(net), enabled: indexers })
  const validators = useQuery({
    ...peQueries.validators(net, { isActive: true, limit: 100 }),
    enabled: indexers,
  })
  const tip = useQuery(platformTipQuery(net))
  const [text, setText] = useDebouncedQuery(search.q, (q) => {
    controls.filter({ q })
  })

  const base = useMemo(
    () =>
      buildEvoRows(data.rows, {
        platform: platform.data?.data,
        validators: validators.data?.data.items,
      }),
    [data.rows, platform.data, validators.data],
  )
  const candidate = platform.data?.data.upgrade.candidate
  const counts = useMemo(() => evoFilterCounts(base, candidate), [base, candidate])
  const matching = useMemo(
    () => sortEvoRows(filterEvoRows(base, { q: search.q, pf: search.pf, candidate }), search.sort),
    [base, search.q, search.pf, search.sort, candidate],
  )
  const pages = Math.max(1, Math.ceil(matching.length / EVO_PAGE_SIZE))
  const page = Math.min(search.page, pages)
  const window = useMemo(
    () => matching.slice((page - 1) * EVO_PAGE_SIZE, page * EVO_PAGE_SIZE),
    [matching, page],
  )

  const epoch = tip.data?.data.epoch.number
  const asked = useMemo(() => window.map((e) => e.protx).slice(0, SDK_BATCH), [window])
  const blocks = useQuery({
    ...sdkQueries['epoch.evonodesProposedBlocksByIds'](net, {
      epoch: epoch ?? 0,
      proTxHashes: asked,
    }),
    enabled: epoch !== undefined && asked.length > 0,
  })
  const shown = useMemo(
    () =>
      blocks.data
        ? buildEvoRows(
            window.map((e) => e.row),
            {
              platform: platform.data?.data,
              validators: validators.data?.data.items,
              proposed: { asked: new Set(asked), counts: blocks.data.data },
            },
          )
        : window,
    [blocks.data, window, asked, platform.data, validators.data],
  )

  const columns = useEvoColumns({ indexers })
  const stamps: SourceStamp[] = [
    ...(data.dapi ? [data.dapi] : []),
    ...(platform.data ? [stampOf(platform.data)] : []),
    ...(validators.data ? [stampOf(validators.data)] : []),
    ...(blocks.data ? [stampOf(blocks.data)] : []),
  ]
  const filters: { id: PlatformFilter; label: string }[] = [
    { id: 'all', label: t`All` },
    { id: 'proposed', label: t`Proposed this epoch` },
    { id: 'not-in-set', label: t`Not in a validator set` },
    ...(candidate == null
      ? []
      : [{ id: 'vote-not-counted' as const, label: t`Upgrade vote not counted` }]),
  ]

  return (
    <div className="rx-card min-w-0">
      <TableTools>
        {indexers ? (
          <SegFilter
            label={t`Evonodes`}
            value={search.pf}
            onChange={(id) => {
              controls.filter({ pf: id as PlatformFilter })
            }}
            options={filters.map((f) => ({ ...f, count: counts[f.id] }))}
          />
        ) : null}
        <SearchField
          label={t`Search evonodes`}
          placeholder={t`ProTx, identity, IP or Drive version`}
          value={text}
          onChange={setText}
        />
        <SortPicker controls={controls} options={sortOptionsOf(columns)} />
      </TableTools>
      <ActiveFilters
        matches={matching.length}
        tokens={[
          ...(search.pf === 'all'
            ? []
            : [{ id: 'pf', label: filters.find((f) => f.id === search.pf)?.label ?? search.pf }]),
          ...(search.q ? [{ id: 'q', label: t`Search: ${search.q}` }] : []),
        ]}
        onRemove={(id) => {
          controls.filter(id === 'pf' ? { pf: 'all' } : { q: undefined })
          if (id === 'q') setText('')
        }}
        onClear={() => {
          setText('')
          controls.filter({ pf: 'all', q: undefined })
        }}
      >
        {epoch === undefined ? null : t`Epoch ${formatInt(epoch)}`}
      </ActiveFilters>
      <div className="min-[1024px]:overflow-x-auto min-[1024px]:[&_th]:static">
        <DataTable
          caption={t`Evonodes`}
          columns={columns}
          rows={shown}
          getRowId={(e) => e.protx}
          rowLink={(e) =>
            ({ to: '/mn/$protx', params: { protx: e.protx }, search: { tab: 'platform' } }) as never
          }
          state={shown.length === 0 ? 'empty' : 'ready'}
          empty={
            <Empty
              kind="no-match"
              title={t`No evonodes match`}
              body={t`Clear the filter or search for something else.`}
            />
          }
          sort={{
            value: search.sort,
            onChange: (sort) => {
              controls.sort({ sort })
            },
          }}
          paging={
            pages > 1
              ? {
                  kind: 'page',
                  page,
                  limit: EVO_PAGE_SIZE,
                  total: matching.length,
                  to: mnPageLink,
                }
              : undefined
          }
          phone="cards"
          source={stamps}
        />
      </div>
    </div>
  )
}
