import { useLingui } from '@lingui/react/macro'
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import type { Sourced } from '@/data/envelope'
import { peQueries } from '@/data/pe/queries'
import { Entity, IdentityRef, PageLink, useNetwork } from '@/features/entity'
import { formatInt } from '@/lib/format'
import { Amount, Card, Empty, SegFilter, queryView, stampsOf } from '@/ui'
import { BOARD_PAGE, rankDesc, type Ranked } from './rank'

const TOP = 10
interface BoardRow {
  key: string
  who: ReactNode
  figure: ReactNode
  /** What the board ranks by; the figure shown is its text. */
  value: bigint | number
}

interface Board {
  id: string
  title: string
  unit: string
  query: UseQueryResult<Sourced<unknown>>
  ranked: Ranked<BoardRow>[]
  actions?: ReactNode
}

function board<T>({
  rows,
  query,
  ...rest
}: Omit<Board, 'query' | 'ranked'> & {
  query: UseQueryResult<Sourced<T>>
  rows: (data: T) => BoardRow[]
}): Board {
  const all = query.data ? rows(query.data.data) : []
  return { ...rest, query, ranked: rankDesc(all, (r) => r.value).slice(0, TOP) }
}

function BoardCard({ id, title, unit, query, ranked, actions }: Board) {
  const { t } = useLingui()
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
      {ranked.length === 0 ? (
        <Empty kind="none-yet" title={t`Nothing ranked yet`} />
      ) : (
        <ol className="grid gap-2" data-board={id}>
          {ranked.map(({ item, rank }) => (
            <li key={item.key} className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2">
                <span className="rx-num w-5 text-right text-[var(--dh-ink-2,inherit)]">{rank}</span>
                {item.who}
              </span>
              <span className="rx-num">{item.figure}</span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  )
}

/** A board whose answer is in and has nothing above zero has nothing to rank. */
const isQuiet = ({ query, ranked }: Board) =>
  query.isSuccess && ranked.every((r) => r.item.value === 0 || r.item.value === 0n)

/** PE-05: who and what is busiest on Platform. The richest list switches between balance and transition count. */
export function Leaderboards({ rich, active }: { rich: 'balance' | 'txs'; active: boolean }) {
  const { t, i18n } = useLingui()
  const net = useNetwork()
  const navigate = useNavigate()
  const activeIds = useQuery({ ...peQueries.activeIdentities(net, BOARD_PAGE), enabled: active })
  const rating = useQuery({ ...peQueries.contractRating(net, BOARD_PAGE), enabled: active })
  const activity = useQuery({ ...peQueries.contractActivity(net, BOARD_PAGE), enabled: active })
  const richest = useQuery({
    ...peQueries.identities(net, {
      ...BOARD_PAGE,
      order_by: rich === 'txs' ? 'tx_count' : 'balance',
    }),
    enabled: active,
  })
  const tokens = useQuery({ ...peQueries.tokenRating(net, BOARD_PAGE), enabled: active })

  const boards = [
    board({
      id: 'board-active-identities',
      title: t`Most active identities`,
      unit: t`By transitions sent`,
      query: activeIds,
      rows: (page) =>
        page.items.map((r) => ({
          key: r.identifier,
          who: <IdentityRef id={r.identifier} />,
          figure: formatInt(r.transactionsCount),
          value: r.transactionsCount,
        })),
      actions: (
        <PageLink to="/identities" className="rx-go">
          {t`All identities`}
        </PageLink>
      ),
    }),
    board({
      id: 'board-richest',
      title: rich === 'txs' ? t`Busiest identities` : t`Richest identities`,
      unit: rich === 'txs' ? t`By transition count` : t`By credit balance`,
      query: richest,
      rows: (page) =>
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
          value: rich === 'txs' ? (r.totalTxs ?? 0) : (r.balance ?? 0n),
        })),
      actions: (
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
      ),
    }),
    board({
      id: 'board-tokens',
      title: t`Trending tokens`,
      unit: t`By recent token transitions`,
      query: tokens,
      rows: (page) =>
        page.items.map((r) => ({
          key: r.tokenIdentifier,
          who: <Entity kind="token" id={r.tokenIdentifier} />,
          figure: formatInt(r.transitionCount),
          value: r.transitionCount,
        })),
      actions: (
        <PageLink to="/tokens" className="rx-go">
          {t`All tokens`}
        </PageLink>
      ),
    }),
    board({
      id: 'board-contracts-rated',
      title: t`Top-rated contracts`,
      unit: t`By transitions`,
      query: rating,
      rows: (page) =>
        page.items.map((r) => ({
          key: r.identifier,
          who: <Entity kind="contract" id={r.identifier} />,
          figure: formatInt(r.transitionsCount),
          value: r.transitionsCount,
        })),
    }),
    board({
      id: 'board-contracts-active',
      title: t`Most active contracts`,
      unit: t`By recent transitions`,
      query: activity,
      rows: (page) =>
        page.items.map((r) => ({
          key: r.identifier,
          who: <Entity kind="contract" id={r.identifier} />,
          figure: formatInt(r.transitionsCount),
          value: r.transitionsCount,
        })),
      actions: (
        <PageLink to="/contracts" className="rx-go">
          {t`All contracts`}
        </PageLink>
      ),
    }),
  ]
  // The richest board stays so the switch that changes it stays.
  const quiet = boards.filter(isQuiet).filter((b) => b.id !== 'board-richest')
  const shown = boards.filter((b) => !quiet.includes(b))
  const quietNames = new Intl.ListFormat(i18n.locale, { type: 'conjunction' }).format(
    quiet.map((b) => b.title),
  )

  return (
    <div className="rx-pile" data-leaderboards>
      <div className="rx-cols rx-cols--3">
        {shown.map((b) => (
          <BoardCard key={b.id} {...b} />
        ))}
      </div>
      {quiet.length > 0 ? (
        <p className="text-ink-2" data-quiet-boards>
          {t`Nothing to rank yet: ${quietNames}.`}
        </p>
      ) : null}
    </div>
  )
}
