import { useLingui } from '@lingui/react/macro'
import { useQueries, useQuery, type UseQueryResult } from '@tanstack/react-query'
import { useMemo, useRef, useState } from 'react'
import { stampOf, type Sourced, type SourceStamp } from '@/data/envelope'
import {
  buildEvoRows,
  evoFilterCounts,
  filterEvoRows,
  sortEvoRows,
  type PlatformFilter,
} from '@/data/masternodes/platform'
import type { MnRows } from '@/data/masternodes/rows'
import { peQueries } from '@/data/pe/queries'
import type { PeValidator } from '@/data/pe/schemas'
import { radarQueries } from '@/data/radar/queries'
import { platformTipQuery, sdkQueries } from '@/data/sdk/queries'
import { formatInt } from '@/lib/format'
import type { NetworkId } from '@/lib/network'
import {
  ActiveFilters,
  DataTable,
  Empty,
  firstReadPending,
  SearchField,
  SegFilter,
  TableTools,
  Unavailable,
  useListPosition,
  useReveal,
} from '@/ui'
import { useDebouncedQuery } from '../debounced-query'
import { useEvoColumns } from './evo-columns'
import { SortPicker, sortOptionsOf } from './FilterBar'
import type { MnSearchControls } from './use-mn-search'

/** Evonodes revealed at a time, each step with its own SDK call for their blocks proposed (at most 100 a call). */
const EVO_PAGE_SIZE = 50

export interface PlatformViewProps {
  data: MnRows
  net: NetworkId
  controls: MnSearchControls
  /** Radar's Platform record and Platform Explorer's validators may be asked. */
  indexers: boolean
}

const validatorRecords = (results: readonly UseQueryResult<Sourced<PeValidator | null>>[]) => ({
  items: results.flatMap((r) => (r.data?.data ? [r.data.data] : [])),
  pending: firstReadPending(results),
})

const proposedOf = (results: readonly UseQueryResult<Sourced<Map<string, bigint>>>[]) => ({
  results,
  pending: firstReadPending(results),
})

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
  const [busy, setBusy] = useState(false)
  const reveal = useReveal({
    total: matching.length,
    step: EVO_PAGE_SIZE,
    // The count stops at the list's end, so a page past it never asks for more steps than there are rows.
    steps: search.page,
    reset: JSON.stringify([search.q, search.pf, search.sort]),
    busy,
  })
  const window = useMemo(() => matching.slice(0, reveal.count), [matching, reveal.count])
  const list = useRef<HTMLDivElement>(null)
  useListPosition(list, {
    at: search.page,
    step: EVO_PAGE_SIZE,
    count: reveal.count,
    total: matching.length,
  })

  const epoch = tip.data?.data.epoch.number
  const chunks = useMemo(() => {
    const out: string[][] = []
    for (let i = 0; i < window.length; i += EVO_PAGE_SIZE)
      out.push(window.slice(i, i + EVO_PAGE_SIZE).map((e) => e.protx))
    return out
  }, [window])
  const proposed = useQueries({
    queries: chunks.map((proTxHashes) => ({
      ...sdkQueries['epoch.evonodesProposedBlocksByIds'](net, { epoch: epoch ?? 0, proTxHashes }),
      enabled: epoch !== undefined,
    })),
    combine: proposedOf,
  })
  const blocks = useMemo(() => {
    const asked = new Set<string>()
    const counts = new Map<string, bigint>()
    const stamps: SourceStamp[] = []
    proposed.results.forEach((r, i) => {
      if (!r.data) return
      for (const protx of chunks[i] ?? []) asked.add(protx)
      for (const [protx, n] of r.data.data) counts.set(protx, n)
      stamps.push(stampOf(r.data))
    })
    return { asked, counts, stamps }
  }, [proposed.results, chunks])
  // A queued evonode is not in the active validators' list; its totals come from Platform Explorer's own record of it.
  const unlisted = useMemo(
    () => (validators.data ? window.filter((e) => !e.validator).map((e) => e.protx) : []),
    [validators.data, window],
  )
  const records = useQueries({
    queries: unlisted.map((protx) => ({ ...peQueries.validator(net, protx), enabled: indexers })),
    combine: validatorRecords,
  })
  const shown = useMemo(
    () =>
      buildEvoRows(
        window.map((e) => e.row),
        {
          platform: platform.data?.data,
          validators: validators.data?.data.items,
          records: records.items,
          ...(blocks.asked.size > 0 ? { proposed: blocks } : {}),
        },
      ),
    [blocks, window, platform.data, validators.data, records.items],
  )
  const loading = proposed.pending || records.pending
  if (loading !== busy) setBusy(loading)

  const columns = useEvoColumns({ indexers })
  const stamps: SourceStamp[] = [
    ...(data.dapi ? [data.dapi] : []),
    ...(platform.data ? [stampOf(platform.data)] : []),
    ...(validators.data ? [stampOf(validators.data)] : []),
    ...blocks.stamps,
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
      {indexers ? null : (
        <Unavailable
          compact
          source="pe"
          title={t`Blocks proposed in total, the last block, rewards and the validator set need Radar and Platform Explorer`}
        />
      )}
      <div ref={list}>
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
          paging={reveal.paging}
          phone="cards"
          source={stamps}
        />
      </div>
    </div>
  )
}
