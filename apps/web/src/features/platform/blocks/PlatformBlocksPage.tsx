import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import { peQueries } from '@/data/pe/queries'
import type { PeBlockSummary } from '@/data/pe/schemas'
import { PageFrame, PlatformBlockTable, useNetwork } from '@/features/entity'
import {
  ActiveFilters,
  Card,
  DateRangeFilter,
  Empty,
  ListModeToggle,
  RangeFilter,
  SegFilter,
  TableTools,
} from '@/ui'
import {
  blocksQuery,
  dayEnd,
  HASH,
  needsUpperHeight,
  rangeText,
  type BlocksSearch,
} from '@/data/pe/blocks-query'
import { IndexedList } from './IndexNeeded'
import { FilterPanel, TextFilter } from './list-chrome'
import { useEpochOf } from './use-epoch-of'
import { useListControls } from './use-list-controls'
import { usePagedList } from './use-paged-list'

const LIST_ID = 'platform-blocks'
export function PlatformBlocksPage() {
  const { t } = useLingui()
  return (
    <PageFrame
      path="/platform/blocks"
      title={t`Platform blocks`}
      eyebrow={t`Platform`}
      layer="platform"
      lede={t`Every Platform block with its epoch, proposer, transitions and time.`}
    >
      <IndexedList>
        <BlocksList />
      </IndexedList>
    </PageFrame>
  )
}

function BlocksList() {
  const { t } = useLingui()
  const net = useNetwork()
  const controls = useListControls<BlocksSearch>('/platform/blocks', LIST_ID)
  const { search, mode, limit } = controls
  const both = needsUpperHeight(search)

  const upper = useQuery({
    ...peQueries.blocks(net, {
      timestamp_end: dayEnd(search.to ?? ''),
      limit: 1,
      order: 'desc',
    }),
    enabled: both && search.to !== undefined,
  })
  const upperHeight =
    both && upper.isSuccess ? (upper.data.data.items[0]?.header.height ?? 0) : undefined
  const query = useMemo(() => blocksQuery(search, upperHeight), [search, upperHeight])

  const list = usePagedList<PeBlockSummary>({
    net,
    mode,
    page: search.page,
    limit,
    query,
    resource: 'pblock-list',
    pageOptions: (page) => peQueries.blocks(net, { ...query, page, limit }),
    enabled: !both || upperHeight !== undefined,
    onLoaded: controls.loaded,
  })
  const { epochOf: epochByHeight, stamp: epochStamp } = useEpochOf()
  const epochOf = useCallback(
    (row: PeBlockSummary) => epochByHeight?.(row.header.height),
    [epochByHeight],
  )

  const active = [
    ...(search.height ? [{ id: 'height', label: t`Height: ${rangeText(search.height)}` }] : []),
    ...(search.epoch ? [{ id: 'epoch', label: t`Epoch: ${rangeText(search.epoch)}` }] : []),
    ...(search.gas ? [{ id: 'gas', label: t`Gas: ${rangeText(search.gas)}` }] : []),
    ...(search.txs ? [{ id: 'txs', label: t`Transitions: ${rangeText(search.txs)}` }] : []),
    ...(search.proposer
      ? [{ id: 'proposer', label: t`Proposer: ${search.proposer.slice(0, 8)}…` }]
      : []),
    ...(search.from || search.to
      ? [{ id: 'date', label: t`Date: ${search.from ?? '…'} – ${search.to ?? '…'}` }]
      : []),
  ]
  const clear = (id: string) => {
    controls.filter(id === 'date' ? { from: undefined, to: undefined } : { [id]: undefined })
  }
  const desc = search.sort !== 'height'

  const stamps = [
    ...(list.source ? [list.source] : []),
    ...(epochByHeight && epochStamp ? [epochStamp] : []),
  ]
  const phrase = list.total ?? list.rows.length

  return (
    <Card layer="platform" padding="flush" source={stamps.length > 0 ? stamps : undefined}>
      <TableTools>
        <SegFilter
          label={t`Order`}
          value={desc ? 'new' : 'old'}
          onChange={(id) => {
            controls.filter({ sort: id === 'old' ? 'height' : undefined })
          }}
          options={[
            { id: 'new', label: t({ message: 'Newest first', context: 'list of blocks' }) },
            { id: 'old', label: t({ message: 'Oldest first', context: 'list of blocks' }) },
          ]}
        />
        <span className="inline-flex items-center gap-2 whitespace-nowrap">
          <ListModeToggle listId={LIST_ID} />
        </span>
      </TableTools>
      <FilterPanel count={active.length}>
        <RangeFilter
          label={t`Height`}
          value={rangeText(search.height)}
          onChange={(height) => {
            controls.filter({ height })
          }}
        />
        <RangeFilter
          label={t`Epoch`}
          value={rangeText(search.epoch)}
          onChange={(epoch) => {
            controls.filter({ epoch })
          }}
        />
        <RangeFilter
          label={t`Gas`}
          value={rangeText(search.gas)}
          onChange={(gas) => {
            controls.filter({ gas })
          }}
        />
        <RangeFilter
          label={t`Transitions`}
          value={rangeText(search.txs)}
          onChange={(txs) => {
            controls.filter({ txs })
          }}
        />
        <div className="[&_input[type=date]]:w-[9.5rem]">
          <DateRangeFilter
            label={t`Date`}
            from={search.from}
            to={search.to}
            onChange={({ from, to }) => {
              controls.filter({ from, to })
            }}
          />
        </div>
        <TextFilter
          label={t`Proposer`}
          placeholder={t`ProTxHash of an evonode`}
          value={search.proposer}
          check={(v) => (HASH.test(v) ? undefined : t`A ProTxHash is 64 hexadecimal characters.`)}
          normalise={(v) => v.toLowerCase()}
          onChange={(proposer) => {
            controls.filter({ proposer })
          }}
        />
      </FilterPanel>
      {active.length > 0 ? (
        <ActiveFilters
          matches={phrase}
          tokens={active}
          onRemove={clear}
          onClear={() => {
            controls.filter({
              height: undefined,
              epoch: undefined,
              gas: undefined,
              txs: undefined,
              proposer: undefined,
              from: undefined,
              to: undefined,
            })
          }}
        />
      ) : null}
      <PlatformBlockTable
        rows={list.rows}
        state={list.state}
        error={list.error}
        onRetry={list.retry}
        epochOf={epochByHeight ? epochOf : undefined}
        paging={
          list.paging ?? {
            kind: 'page',
            page: search.page,
            limit,
            total: list.total,
            to: controls.link,
          }
        }
        empty={
          <Empty
            kind={active.length > 0 ? 'no-match' : 'none-yet'}
            title={
              active.length > 0
                ? t`No block matches these filters`
                : t`Platform Explorer has no blocks yet`
            }
          />
        }
      />
    </Card>
  )
}
