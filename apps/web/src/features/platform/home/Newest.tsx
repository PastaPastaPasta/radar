import { plural } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { useMemo, type ReactNode } from 'react'
import type { Sourced } from '@/data/envelope'
import { peQueries } from '@/data/pe/queries'
import { PageLink, PlatformBlockTable, TransitionTable, useNetwork } from '@/features/entity'
import { Card } from '@/ui'
import { queryView, stampsOf } from './state'
import { useHold } from './use-hold'

const SHOWN = 5

function HeldNote({ held, fresh }: { held: boolean; fresh: number }) {
  const { t } = useLingui()
  return (
    <p className="rx-note px-3 pb-2 text-sm" role="status" data-held={held ? 'true' : 'false'}>
      {held
        ? fresh > 0
          ? plural(fresh, {
              one: 'Held still while you look · # newer. Move away to see it.',
              other: 'Held still while you look · # newer. Move away to see them.',
            })
          : t`Held still while you look. New ones appear when you move away.`
        : ''}
    </p>
  )
}

const freshCount = <T,>(live: T[], shown: T[], id: (row: T) => string): number => {
  const seen = new Set(shown.map(id))
  return live.filter((row) => !seen.has(id(row))).length
}

/** A live list of the newest rows: it holds still while the pointer or focus is on it, and says how many it is holding back. */
function NewestCard<T>({
  id,
  title,
  list,
  query,
  rowId,
  actions,
  table,
}: {
  id: string
  title: string
  list: string
  query: UseQueryResult<Sourced<{ items: readonly T[] }>>
  rowId: (row: T) => string
  actions: ReactNode
  table: (rows: T[]) => ReactNode
}) {
  const live = useMemo(() => query.data?.data.items.slice(0, SHOWN) ?? [], [query.data])
  const hold = useHold(live)
  const held = hold.held ? 'true' : 'false'
  return (
    <Card
      id={id}
      layer="platform"
      title={title}
      padding="flush"
      source={stampsOf(query.data)}
      actions={actions}
    >
      <div {...hold.props} data-list={list} data-held={held}>
        {table(hold.shown)}
        <HeldNote held={hold.held} fresh={freshCount(live, hold.shown, rowId)} />
      </div>
    </Card>
  )
}

/** PE-02, blocks: the newest five, updating every few seconds; a list under the pointer or focus holds still. */
export function NewestBlocks() {
  const { t } = useLingui()
  const net = useNetwork()
  const query = useQuery(peQueries.latestBlocks(net, SHOWN))
  return (
    <NewestCard
      id="newest-blocks"
      title={t`Newest blocks`}
      list="blocks"
      query={query}
      rowId={(b) => b.header.hash}
      actions={
        <PageLink to="/platform/blocks" className="rx-go">
          {t`All blocks`}
        </PageLink>
      }
      table={(rows) => (
        <PlatformBlockTable
          caption={t`Newest Platform blocks`}
          columns={['height', 'proposer', 'transitions', 'time']}
          rows={rows}
          {...queryView(query)}
        />
      )}
    />
  )
}

/** PE-02, transitions: the newest five state transitions, held the same way. */
export function NewestTransitions() {
  const { t } = useLingui()
  const net = useNetwork()
  const query = useQuery(peQueries.latestTransactions(net, SHOWN))
  return (
    <NewestCard
      id="newest-transitions"
      title={t`Newest transitions`}
      list="transitions"
      query={query}
      rowId={(r) => r.hash}
      actions={
        <PageLink to="/platform/txs" className="rx-go">
          {t`All transitions`}
        </PageLink>
      }
      table={(rows) => (
        <TransitionTable
          caption={t`Newest Platform transitions`}
          columns={['type', 'hash', 'time']}
          rows={rows}
          {...queryView(query)}
        />
      )}
    />
  )
}
