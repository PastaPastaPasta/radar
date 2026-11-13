import { useLingui } from '@lingui/react/macro'
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import type { Sourced } from '@/data/envelope'
import { peQueries } from '@/data/pe/queries'
import { Entity, IdentityRef, PageLink, useNetwork } from '@/features/entity'
import { formatInt } from '@/lib/format'
import { Amount, Card, Empty, SegFilter } from '@/ui'
import { queryView, stampsOf } from './state'

const TOP = 10

interface BoardRow {
  key: string
  who: ReactNode
  figure: ReactNode
}

function Board<T>({
  id,
  title,
  query,
  rows,
  unit,
  actions,
}: {
  id: string
  title: string
  query: UseQueryResult<Sourced<T>>
  rows: (data: T) => BoardRow[]
  unit: string
  actions?: ReactNode
}) {
  const { t } = useLingui()
  const list = query.data ? rows(query.data.data) : []
  return (
    <Card
      id={id}
      layer="platform"
      title={title}
      subtitle={unit}
      {...queryView(query)}
      source={stampsOf(query.data)}
      actions={actions}
    >
      {list.length === 0 ? (
        <Empty kind="none-yet" title={t`Nothing ranked yet`} />
      ) : (
        <ol className="grid gap-2" data-board={id}>
          {list.map((row, i) => (
            <li key={row.key} className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2">
                <span className="rx-num w-5 text-right text-[var(--dh-ink-2,inherit)]">
                  {i + 1}
                </span>
                {row.who}
              </span>
              <span className="rx-num">{row.figure}</span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  )
}

/** PE-05: who and what is busiest on Platform. The richest list switches between balance and transition count. */
export function Leaderboards({ rich, active }: { rich: 'balance' | 'txs'; active: boolean }) {
  const { t } = useLingui()
  const net = useNetwork()
  const navigate = useNavigate()
  const q = { limit: TOP }
  const activeIds = useQuery({ ...peQueries.activeIdentities(net, q), enabled: active })
  const rating = useQuery({ ...peQueries.contractRating(net, q), enabled: active })
  const activity = useQuery({ ...peQueries.contractActivity(net, q), enabled: active })
  const richest = useQuery({
    ...peQueries.identities(net, {
      limit: TOP,
      order: 'desc',
      order_by: rich === 'txs' ? 'tx_count' : 'balance',
    }),
    enabled: active,
  })
  const tokens = useQuery({ ...peQueries.tokenRating(net, q), enabled: active })

  return (
    <div className="grid gap-4" data-leaderboards>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegFilter
          label={t`Richest identities by`}
          value={rich}
          options={[
            { id: 'balance', label: t`Balance` },
            { id: 'txs', label: t`Transitions` },
          ]}
          onChange={(r) => {
            void navigate({
              to: '/platform',
              search: ((s: Record<string, unknown>) => ({ ...s, rich: r })) as never,
              replace: true,
            })
          }}
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Board
          id="board-active-identities"
          title={t`Most active identities`}
          unit={t`By transitions sent`}
          query={activeIds}
          rows={(page) =>
            page.items.map((r) => ({
              key: r.identifier,
              who: <IdentityRef id={r.identifier} />,
              figure: formatInt(r.transactionsCount),
            }))
          }
          actions={
            <PageLink to="/identities" className="rx-go">
              {t`All identities`}
            </PageLink>
          }
        />
        <Board
          id="board-richest"
          title={rich === 'txs' ? t`Busiest identities` : t`Richest identities`}
          unit={rich === 'txs' ? t`By transition count` : t`By credit balance`}
          query={richest}
          rows={(page) =>
            page.items.map((r) => ({
              key: r.identifier,
              who: <IdentityRef id={r.identifier} />,
              figure:
                rich === 'txs' ? (
                  formatInt(r.totalTxs ?? 0)
                ) : r.balance == null ? (
                  '—'
                ) : (
                  <Amount value={r.balance} kind="credits" compact />
                ),
            }))
          }
        />
        <Board
          id="board-tokens"
          title={t`Trending tokens`}
          unit={t`By recent token transitions`}
          query={tokens}
          rows={(page) =>
            page.items.map((r) => ({
              key: r.tokenIdentifier,
              who: <Entity kind="token" id={r.tokenIdentifier} />,
              figure: formatInt(r.transitionCount),
            }))
          }
          actions={
            <PageLink to="/tokens" className="rx-go">
              {t`All tokens`}
            </PageLink>
          }
        />
        <Board
          id="board-contracts-rated"
          title={t`Top-rated contracts`}
          unit={t`By transitions`}
          query={rating}
          rows={(page) =>
            page.items.map((r) => ({
              key: r.identifier,
              who: <Entity kind="contract" id={r.identifier} />,
              figure: formatInt(r.transitionsCount),
            }))
          }
        />
        <Board
          id="board-contracts-active"
          title={t`Most active contracts`}
          unit={t`By recent transitions`}
          query={activity}
          rows={(page) =>
            page.items.map((r) => ({
              key: r.identifier,
              who: <Entity kind="contract" id={r.identifier} />,
              figure: formatInt(r.transitionsCount),
            }))
          }
          actions={
            <PageLink to="/contracts" className="rx-go">
              {t`All contracts`}
            </PageLink>
          }
        />
      </div>
    </div>
  )
}
