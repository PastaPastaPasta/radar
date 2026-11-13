import { i18n } from '@lingui/core'
import { useLingui } from '@lingui/react/macro'
import { useMemo } from 'react'
import { peQueries } from '@/data/pe/queries'
import type { PeTransaction } from '@/data/pe/schemas'
import { PageFrame, TransitionTable, useNetwork } from '@/features/entity'
import { BATCH_TYPES, type BatchType, type TransitionType } from '@/lib/tx-types'
import {
  ActiveFilters,
  Card,
  DateRangeFilter,
  Empty,
  ListModeToggle,
  RangeFilter,
  SegFilter,
  TableTools,
  TYPE_META,
  TypeBadge,
} from '@/ui'
import { rangeText } from '@/data/pe/blocks-query'
import { IndexedList } from '../blocks/IndexNeeded'
import { FilterPanel, TextFilter } from '../blocks/list-chrome'
import { useListControls } from '../blocks/use-list-controls'
import { usePagedList } from '../blocks/use-paged-list'
import { MultiSelect, type MultiSelectOption } from './MultiSelect'
import { FILTER_TYPES, txsQuery, type TxsSearch } from '@/data/pe/transitions-query'

const LIST_ID = 'platform-txs'
/** A base58 identifier: what Explorer takes for an owner. */
const IDENTIFIER = /^[1-9A-HJ-NP-Za-km-z]{42,44}$/

const SORTS = ['time', 'gas', 'owner'] as const

const typeText = (type: TransitionType | BatchType) => i18n._(TYPE_META[type].label)

const typeOptions = (types: readonly (TransitionType | BatchType)[]): MultiSelectOption[] =>
  types.map((type) => ({
    id: type,
    text: typeText(type),
    node: <TypeBadge type={type} />,
  }))

export function TransitionsPage() {
  const { t } = useLingui()
  return (
    <PageFrame
      path="/platform/txs"
      title={t`State transitions`}
      eyebrow={t`Platform`}
      layer="platform"
      lede={t`Every state transition with its type, status, block, gas and owner.`}
    >
      <IndexedList>
        <TransitionsList />
      </IndexedList>
    </PageFrame>
  )
}

function TransitionsList() {
  const { t } = useLingui()
  const net = useNetwork()
  const controls = useListControls<TxsSearch>('/platform/txs', LIST_ID)
  const { search, mode, limit } = controls
  const query = useMemo(() => txsQuery(search), [search])
  const list = usePagedList<PeTransaction>({
    net,
    mode,
    page: search.page,
    limit,
    query,
    resource: 'ptx-list',
    pageOptions: (page) => peQueries.transactions(net, { ...query, page, limit }),
    enabled: true,
    onLoaded: controls.loaded,
  })

  const types = search.type ?? []
  const batches = search.batch ?? []
  const sortField = search.sort.replace(/^-/, '')
  const desc = search.sort.startsWith('-')
  const sortLabels: Record<(typeof SORTS)[number], string> = {
    time: t`Time`,
    gas: t`Gas`,
    owner: t`Owner`,
  }
  const batchOptions = useMemo(() => typeOptions(BATCH_TYPES), [])
  const typeChoices = useMemo(() => typeOptions(FILTER_TYPES), [])

  const active = [
    ...types.map((v) => ({ id: `type:${v}`, label: t`Type: ${typeText(v)}` })),
    ...batches.map((v) => ({
      id: `batch:${v}`,
      label: t`Batch: ${typeText(v as BatchType)}`,
    })),
    ...(search.status
      ? [{ id: 'status', label: search.status === 'fail' ? t`Failed only` : t`Succeeded only` }]
      : []),
    ...(search.gas ? [{ id: 'gas', label: t`Gas: ${rangeText(search.gas)}` }] : []),
    ...(search.owner ? [{ id: 'owner', label: t`Owner: ${search.owner.slice(0, 8)}…` }] : []),
    ...(search.from || search.to
      ? [{ id: 'date', label: t`Date: ${search.from ?? '…'} – ${search.to ?? '…'}` }]
      : []),
  ]
  const remove = (id: string) => {
    const [kind, value] = id.split(':')
    if (kind === 'type') {
      controls.filter({ type: types.filter((v) => v !== value) })
    } else if (kind === 'batch') {
      controls.filter({ batch: batches.filter((v) => v !== value) })
    } else {
      controls.filter(id === 'date' ? { from: undefined, to: undefined } : { [id]: undefined })
    }
  }

  return (
    <Card layer="platform" padding="flush" source={list.source}>
      <TableTools>
        <SegFilter
          label={t`Status`}
          value={search.status ?? 'all'}
          onChange={(id) => {
            controls.filter({ status: id === 'all' ? undefined : id })
          }}
          options={[
            { id: 'all', label: t`All` },
            { id: 'success', label: t`Succeeded` },
            { id: 'fail', label: t`Failed` },
          ]}
        />
        <label className="flex items-center gap-2 text-sm">
          <span className="whitespace-nowrap">{t`Sort by`}</span>
          <select
            className="dh-select dh-select--sm"
            value={SORTS.find((s) => s === sortField) ?? 'time'}
            onChange={(e) => {
              controls.filter({ sort: desc ? `-${e.target.value}` : e.target.value })
            }}
          >
            {SORTS.map((s) => (
              <option key={s} value={s}>
                {sortLabels[s]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="dh-btn dh-btn--sm"
          aria-label={
            desc ? t`Descending. Switch to ascending` : t`Ascending. Switch to descending`
          }
          onClick={() => {
            controls.filter({ sort: desc ? sortField : `-${sortField}` })
          }}
        >
          {desc ? '↓' : '↑'}
        </button>
        <span className="inline-flex items-center gap-2 whitespace-nowrap">
          <ListModeToggle listId={LIST_ID} />
        </span>
      </TableTools>
      <FilterPanel count={active.length}>
        <MultiSelect
          label={t`Type`}
          options={typeChoices}
          value={types}
          onChange={(type) => {
            controls.filter({
              type: type.length > 0 ? type : undefined,
              ...(type.length > 0 && !(type.length === 1 && type[0] === 'batch')
                ? { batch: undefined }
                : {}),
            })
          }}
        />
        <MultiSelect
          label={t`Batch type`}
          options={batchOptions}
          value={batches}
          onChange={(batch) => {
            controls.filter({
              batch: batch.length > 0 ? batch : undefined,
              ...(batch.length > 0 ? { type: undefined } : {}),
            })
          }}
        />
        <RangeFilter
          label={t`Gas`}
          value={rangeText(search.gas)}
          onChange={(gas) => {
            controls.filter({ gas })
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
          label={t`Owner`}
          placeholder={t`Identity ID`}
          value={search.owner}
          check={(v) => (IDENTIFIER.test(v) ? undefined : t`That isn’t an identity ID.`)}
          onChange={(owner) => {
            controls.filter({ owner })
          }}
        />
      </FilterPanel>
      {active.length > 0 ? (
        <ActiveFilters
          matches={list.total ?? list.rows.length}
          tokens={active}
          onRemove={remove}
          onClear={() => {
            controls.filter({
              type: undefined,
              batch: undefined,
              status: undefined,
              gas: undefined,
              owner: undefined,
              from: undefined,
              to: undefined,
            })
          }}
        >
          {batches.length > 0 ? t`A batch type shows batches only.` : null}
        </ActiveFilters>
      ) : null}
      <TransitionTable
        rows={list.rows}
        state={list.state}
        error={list.error}
        onRetry={list.retry}
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
                ? t`No state transition matches these filters`
                : t`Platform Explorer has no state transitions yet`
            }
          />
        }
      />
    </Card>
  )
}
