import { useLingui } from '@lingui/react/macro'
import { useMemo } from 'react'
import { peQueries } from '@/data/pe/queries'
import type { PeTransaction } from '@/data/pe/schemas'
import { PageFrame, ScrollList, TransitionTable, useNetwork, pagePosition } from '@/features/entity'
import { ActiveFilters, Card, Empty, TableTools } from '@/ui'
import { IndexedList } from '../blocks/IndexNeeded'
import { FilterPanel, TextFilter } from '../blocks/list-chrome'
import { useListControls } from '../blocks/use-list-controls'
import { usePeScroll } from '../pe-scroll'
import { txsQuery, type TxsSearch } from '@/data/pe/transitions-query'
import {
  NO_TRANSITION_FILTERS,
  StatusFilter,
  TransitionFilterFields,
  useTransitionFilterTokens,
} from './filters'

/** A base58 identifier: what Explorer takes for an owner. */
const IDENTIFIER = /^[1-9A-HJ-NP-Za-km-z]{42,44}$/

/** What a person types for a DPNS name: a label, with or without .dash. */
const NAME_LIKE = /^[a-z0-9-]{3,63}(\.dash)?$/i

const SORTS = ['time', 'gas', 'owner'] as const

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
  const controls = useListControls<TxsSearch>('/platform/txs')
  const { search } = controls
  const { limit } = search
  const query = useMemo(() => txsQuery(search), [search])
  const list = usePeScroll({
    listKey: JSON.stringify(query),
    start: search.page,
    limit,
    page: (page) => peQueries.transactions(net, { ...query, page, limit }),
    getRowId: (r: PeTransaction) => r.hash,
  })

  const batches = search.batch ?? []
  const sortField = search.sort.replace(/^-/, '')
  const desc = search.sort.startsWith('-')
  const sortLabels: Record<(typeof SORTS)[number], string> = {
    time: t`Time`,
    gas: t`Gas`,
    owner: t`Owner`,
  }
  const filters = useTransitionFilterTokens(search)
  const active = [
    ...filters.tokens,
    ...(search.owner ? [{ id: 'owner', label: t`Owner: ${search.owner.slice(0, 8)}…` }] : []),
  ]
  const remove = (id: string) => {
    controls.filter(id === 'owner' ? { owner: undefined } : filters.removal(id))
  }

  return (
    <Card layer="platform" source={list.stamps[0]}>
      <TableTools>
        <StatusFilter value={search.status} onChange={controls.filter} />
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
      </TableTools>
      <FilterPanel count={active.length}>
        <TransitionFilterFields value={search} onChange={controls.filter} />
        <TextFilter
          label={t`Owner`}
          placeholder={t`Identity ID`}
          value={search.owner}
          check={(v) =>
            IDENTIFIER.test(v)
              ? undefined
              : NAME_LIKE.test(v)
                ? t`The Owner filter takes an identity ID, not a name. Open the name to copy its identity ID.`
                : t`That isn’t an identity ID: it is 43 or 44 base58 characters.`
          }
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
            controls.filter({ ...NO_TRANSITION_FILTERS, owner: undefined })
          }}
        >
          {batches.length > 0 ? t`A batch type shows batches only.` : null}
        </ActiveFilters>
      ) : null}
      <ScrollList chain={list} position={pagePosition}>
        <TransitionTable
          rows={list.rows}
          state={list.state}
          error={list.error}
          onRetry={list.onRetry}
          paging={list.paging}
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
      </ScrollList>
    </Card>
  )
}
