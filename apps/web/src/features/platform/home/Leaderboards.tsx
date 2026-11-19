import { useLingui } from '@lingui/react/macro'
import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import type { CSSProperties, ReactNode } from 'react'
import type { Sourced } from '@/data/envelope'
import { rangeWindow } from '@/data/pe/params'
import { peQueries } from '@/data/pe/queries'
import { Entity, IdentityRef, PageLink, useNetwork } from '@/features/entity'
import { formatInt } from '@/lib/format'
import { Amount, Card, SegFilter, queryView, stampsOf } from '@/ui'
import { arrangeBoards, pairRows } from './arrange'
import { BOARD_PAGE, boardRows, type Ranked } from './rank'

const TOP = 10
/** The span the activity boards count over, the one PE's own trend lists use. */
const SPAN = '30d'

interface BoardRow {
  key: string
  who: ReactNode
  /** What the board ranks by. */
  value: bigint | number
}

interface Board {
  id: string
  title: string
  unit: string
  query: UseQueryResult<Sourced<unknown>>
  /** Every row above zero, merged by key and ranked. */
  ranked: Ranked<BoardRow>[]
  figure: (value: bigint | number) => ReactNode
  /** What the card says when nothing in its span is above zero. */
  none: string
  actions?: ReactNode
  pinned?: boolean
}

function board<T>({
  rows,
  query,
  ...rest
}: Omit<Board, 'query' | 'ranked'> & {
  query: UseQueryResult<Sourced<T>>
  rows: (data: T) => BoardRow[]
}): Board {
  return { ...rest, query, ranked: query.data ? boardRows(rows(query.data.data)) : [] }
}

const count = (v: bigint | number) => formatInt(Number(v))

function BoardCard({
  board: { id, title, unit, query, ranked, figure, none, actions },
  shown,
  layout,
}: {
  board: Board
  shown: number
  layout: 'half' | 'wide' | 'short'
}) {
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
      className="rx-board"
    >
      {ranked.length === 0 ? (
        <p className="rx-board__none" data-board-none>
          {none}
        </p>
      ) : (
        <ol
          className="rx-board__list"
          data-board={id}
          data-layout={layout}
          style={{ '--rows': Math.ceil(Math.min(shown, ranked.length) / 2) } as CSSProperties}
        >
          {ranked.slice(0, shown).map(({ item, rank, tied }) => (
            <li key={item.key} className="rx-board__row" data-tied={tied || undefined}>
              <span className="rx-board__rank rx-num">
                {tied ? <span aria-hidden="true">=</span> : null}
                {rank}
                {tied ? <span className="dh-sr">{t`, tied`}</span> : null}
              </span>
              <span className="rx-board__who">{item.who}</span>
              <span className="rx-board__fig rx-num">{figure(item.value)}</span>
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
  const span = { ...BOARD_PAGE, ...rangeWindow(SPAN) }
  const recent = { enabled: active, placeholderData: keepPreviousData }
  const activeIds = useQuery({ ...peQueries.activeIdentities(net, span), ...recent })
  const contracts = useQuery({ ...peQueries.contractActivity(net, span), ...recent })
  const tokens = useQuery({ ...peQueries.tokenRating(net, span), ...recent })
  const richest = useQuery({
    ...peQueries.identities(net, {
      ...BOARD_PAGE,
      order_by: rich === 'txs' ? 'tx_count' : 'balance',
    }),
    enabled: active,
  })
  const quiet = t`No transitions in the last 30 days.`

  const boards = [
    board({
      id: 'board-active-identities',
      title: t`Most active identities`,
      unit: t`By transitions sent in the last 30 days`,
      query: activeIds,
      rows: (page) =>
        page.items.map((r) => ({
          key: r.identifier,
          who: <IdentityRef id={r.identifier} />,
          value: r.transactionsCount,
        })),
      figure: count,
      none: quiet,
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
          value: rich === 'txs' ? (r.totalTxs ?? 0) : (r.balance ?? 0n),
        })),
      figure: (v) =>
        typeof v === 'bigint' ? <Amount value={v} kind="credits" compact /> : formatInt(v),
      none: t`Nothing ranked yet`,
      pinned: true,
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
      id: 'board-contracts',
      title: t`Busiest contracts`,
      unit: t`By transitions in the last 30 days`,
      query: contracts,
      rows: (page) =>
        page.items.map((r) => ({
          key: r.identifier,
          who: <Entity kind="contract" id={r.identifier} />,
          value: r.transitionsCount,
        })),
      figure: count,
      none: quiet,
      actions: (
        <PageLink to="/contracts" className="rx-go">
          {t`All contracts`}
        </PageLink>
      ),
    }),
    board({
      id: 'board-tokens',
      title: t`Trending tokens`,
      unit: t`By token transitions in the last 30 days`,
      query: tokens,
      rows: (page) =>
        page.items.map((r) => ({
          key: r.tokenIdentifier,
          who: <Entity kind="token" id={r.tokenIdentifier} />,
          value: r.transitionCount,
        })),
      figure: count,
      none: quiet,
      actions: (
        <PageLink to="/tokens" className="rx-go">
          {t`All tokens`}
        </PageLink>
      ),
    }),
  ]

  const { full, wide, short } = arrangeBoards(
    boards.map((b) => ({
      ...b,
      rows: b.query.data === undefined ? undefined : b.ranked.length,
    })),
  )
  const partnerOf = (i: number) => full[i % 2 === 0 ? i + 1 : i - 1]?.rows

  return (
    <div className="rx-boards" data-leaderboards>
      {full.length > 0 ? (
        <div className="rx-boards__full">
          {full.map((b, i) => (
            <BoardCard
              key={b.id}
              board={b}
              layout="half"
              shown={pairRows(b.rows ?? TOP, partnerOf(i), TOP)}
            />
          ))}
        </div>
      ) : null}
      {wide ? <BoardCard board={wide} layout="wide" shown={TOP} /> : null}
      {short.length > 0 ? (
        <div className="rx-boards__short" data-short-boards>
          {short.map((b) => (
            <BoardCard
              key={b.id}
              board={b}
              layout={short.length === 1 ? 'wide' : 'short'}
              shown={TOP}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}
