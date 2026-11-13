import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { stampOf } from '@/data/envelope'
import { peQueries } from '@/data/pe/queries'
import type { PeBlockSummary, PeTransaction } from '@/data/pe/schemas'
import { PageLink, PlatformBlockTable, TransitionTable, useNetwork } from '@/features/entity'
import { Card } from '@/ui'
import { cardState } from './state'
import { useHold } from './use-hold'

const SHOWN = 5

function HeldNote({ held, fresh }: { held: boolean; fresh: number }) {
  const { t } = useLingui()
  return (
    <p className="rx-note px-3 pb-2 text-sm" role="status" data-held={held ? 'true' : 'false'}>
      {held
        ? fresh > 0
          ? t`Held still while you look · ${fresh} newer. Move away to see them.`
          : t`Held still while you look. New ones appear when you move away.`
        : ''}
    </p>
  )
}

const freshCount = <T,>(live: T[], shown: T[], id: (row: T) => string): number => {
  const seen = new Set(shown.map(id))
  return live.filter((row) => !seen.has(id(row))).length
}

/** PE-02, blocks: the newest five, updating every few seconds; a list under the pointer or focus holds still. */
export function NewestBlocks() {
  const { t } = useLingui()
  const net = useNetwork()
  const query = useQuery(peQueries.latestBlocks(net, SHOWN))
  const live = useMemo(() => query.data?.data.items.slice(0, SHOWN) ?? [], [query.data])
  const hold = useHold<PeBlockSummary[]>(live)
  return (
    <Card
      id="newest-blocks"
      layer="platform"
      title={t`Newest blocks`}
      padding="flush"
      source={query.data ? stampOf(query.data) : undefined}
      actions={
        <PageLink to="/platform/blocks" className="rx-go">
          {t`All blocks`}
        </PageLink>
      }
    >
      <div {...hold.props} data-list="blocks" data-held={hold.held ? 'true' : 'false'}>
        <PlatformBlockTable
          caption={t`Newest Platform blocks`}
          columns={['height', 'proposer', 'transitions', 'time']}
          rows={hold.shown}
          state={cardState(query)}
          error={query.error}
          onRetry={() => void query.refetch()}
        />
        <HeldNote held={hold.held} fresh={freshCount(live, hold.shown, (b) => b.header.hash)} />
      </div>
    </Card>
  )
}

/** PE-02, transitions: the newest five state transitions, held the same way. */
export function NewestTransitions() {
  const { t } = useLingui()
  const net = useNetwork()
  const query = useQuery(peQueries.latestTransactions(net, SHOWN))
  const live = useMemo(() => query.data?.data.items.slice(0, SHOWN) ?? [], [query.data])
  const hold = useHold<PeTransaction[]>(live)
  return (
    <Card
      id="newest-transitions"
      layer="platform"
      title={t`Newest transitions`}
      padding="flush"
      source={query.data ? stampOf(query.data) : undefined}
      actions={
        <PageLink to="/platform/txs" className="rx-go">
          {t`All transitions`}
        </PageLink>
      }
    >
      <div {...hold.props} data-list="transitions" data-held={hold.held ? 'true' : 'false'}>
        <TransitionTable
          caption={t`Newest Platform transitions`}
          columns={['type', 'hash', 'time']}
          rows={hold.shown}
          state={cardState(query)}
          error={query.error}
          onRetry={() => void query.refetch()}
        />
        <HeldNote held={hold.held} fresh={freshCount(live, hold.shown, (r) => r.hash)} />
      </div>
    </Card>
  )
}
