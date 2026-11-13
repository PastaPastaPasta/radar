import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'
import { stampOf, type SourceStamp } from '@/data/envelope'
import { useDecentralizedOnly } from '@/data/health'
import { peQueries } from '@/data/pe/queries'
import type { PeTransaction } from '@/data/pe/schemas'
import { Entity, PageLink, useNetwork } from '@/features/entity'
import { formatInt } from '@/lib/format'
import { isDevnet } from '@/lib/network'
import {
  Card,
  DataTable,
  Empty,
  Icon,
  LiveControl,
  Time,
  TYPE_META,
  Unavailable,
  usePausedFeed,
} from '@/ui'
import { SourceRow, SourceScope, useSectionSources } from './Figure'
import { transitionKind } from './transition-types'
import { useFrozen } from './use-frozen'

const TRANSITIONS = 8
const BLOCKS = 8

type Listed<T> = (SourceStamp & { data: { items: T[] } }) | undefined

interface ListQuery {
  error: unknown
  isError: boolean
  refetch: () => unknown
}

/** What the list needs of a Platform block row. */
interface PlatformBlockRow {
  header: { hash: string; height: number; timestamp: number; l1LockedHeight?: number | null }
  txs: unknown[]
}

function loadState(error: boolean, shown: unknown) {
  return error && !shown ? 'error' : shown ? 'ready' : 'loading'
}

function TransitionsCard({ query, shown }: { query: ListQuery; shown: Listed<PeTransaction> }) {
  const { t } = useLingui()
  const columns = useMemo<ColumnDef<PeTransaction>[]>(
    () => [
      {
        id: 'type',
        header: t`Type`,
        cell: ({ row }) => {
          const kind = transitionKind(row.original.type, row.original.batchType)
          const meta = TYPE_META[kind.type]
          return (
            <span className="rx-type" data-layer={meta.layer} data-type={kind.type}>
              <Icon name={meta.icon} />
              {kind.label}
            </span>
          )
        },
        meta: { phone: 'title' },
      },
      {
        id: 'hash',
        header: t`Transition`,
        cell: ({ row }) => <Entity kind="transition" id={row.original.hash} copy={false} />,
        meta: { phone: 'secondary' },
      },
      {
        id: 'age',
        header: t`Age`,
        cell: ({ row }) => <Time ms={row.original.timestamp} mode="relative" live />,
        meta: { phone: 'primary' },
      },
    ],
    [t],
  )
  return (
    <Card
      title={t`Platform transitions`}
      padding="flush"
      source={shown ? stampOf(shown) : undefined}
      actions={
        <PageLink to="/platform/txs" className="rx-go" aria-label={t`View all transitions`}>
          {t`View all`}
        </PageLink>
      }
    >
      <DataTable
        caption={t`Latest Platform transitions`}
        columns={columns}
        rows={(shown?.data.items ?? []).slice(0, TRANSITIONS)}
        getRowId={(r) => r.hash}
        state={loadState(query.isError, shown)}
        error={query.error}
        onRetry={() => void query.refetch()}
        rowLink={(r) => ({ to: '/platform/tx/$hash', params: { hash: r.hash } })}
      />
    </Card>
  )
}

function BlocksCard({ query, shown }: { query: ListQuery; shown: Listed<PlatformBlockRow> }) {
  const { t } = useLingui()
  const columns = useMemo<ColumnDef<PlatformBlockRow>[]>(
    () => [
      {
        id: 'block',
        header: t`Block`,
        cell: ({ row }) => (
          <Entity kind="platform-block" id={String(row.original.header.height)} copy={false} />
        ),
        meta: { phone: 'title' },
      },
      {
        id: 'age',
        header: t`Age`,
        cell: ({ row }) => <Time ms={row.original.header.timestamp} mode="relative" live />,
        meta: { phone: 'primary' },
      },
      {
        id: 'txs',
        header: t`Txs`,
        accessorFn: (r) => formatInt(r.txs.length),
        meta: { numeric: true, phone: 'secondary', phoneUnit: t`tx` },
      },
      {
        id: 'locked',
        header: t`Locked to Core block`,
        cell: ({ row }) =>
          row.original.header.l1LockedHeight ? (
            <Entity kind="block" id={String(row.original.header.l1LockedHeight)} copy={false} />
          ) : (
            '—'
          ),
        meta: { phone: 'secondary' },
      },
    ],
    [t],
  )
  return (
    <Card
      title={t`Platform blocks`}
      padding="flush"
      source={shown ? stampOf(shown) : undefined}
      actions={
        <PageLink to="/platform/blocks" className="rx-go">
          {t`All Platform blocks`}
        </PageLink>
      }
    >
      <DataTable
        caption={t`Latest Platform blocks`}
        columns={columns}
        rows={(shown?.data.items ?? []).slice(0, BLOCKS)}
        getRowId={(r) => r.header.hash}
        state={loadState(query.isError, shown)}
        error={query.error}
        onRetry={() => void query.refetch()}
        rowLink={(r) => ({ to: '/platform/block/$id', params: { id: String(r.header.height) } })}
      />
    </Card>
  )
}

/** Dash Platform: its latest transitions beside its latest blocks, each with the Core block it is locked to. */
export function PlatformSection() {
  const { t } = useLingui()
  const net = useNetwork()
  const off = useDecentralizedOnly()
  const devnet = isDevnet(net)
  const indexed = !devnet && !off
  const [paused, setPaused] = usePausedFeed('home-platform')
  const transitions = useQuery({ ...peQueries.latestTransactions(net, 10), enabled: indexed })
  const blocks = useQuery({ ...peQueries.latestBlocks(net, 10), enabled: indexed })
  const shownTransitions = useFrozen(transitions.data, paused)
  const shownBlocks = useFrozen(blocks.data, paused)
  const newest = blocks.data?.data.items[0]?.header.height
  const newCount =
    paused && newest !== undefined
      ? Math.max(0, newest - (shownBlocks?.data.items[0]?.header.height ?? newest))
      : 0
  const { line, covered } = useSectionSources([
    shownTransitions ? stampOf(shownTransitions) : undefined,
    shownBlocks ? stampOf(shownBlocks) : undefined,
  ])
  return (
    <section
      className="rx-home__sec"
      id="platform"
      data-layer="platform"
      aria-labelledby="h-platform"
    >
      <div className="rx-sec__head">
        <h2 className="rx-sec__title" id="h-platform">
          {t`Dash Platform`}
        </h2>
        <p className="rx-sec__desc">{t`Each Platform block is locked to a Core block.`}</p>
        {indexed ? (
          <div className="rx-sec__actions">
            <LiveControl
              paused={paused}
              onToggle={() => setPaused(!paused)}
              newCount={newCount}
              pulseKey={newest}
              noun={t`Platform updates`}
            />
          </div>
        ) : null}
      </div>
      {devnet ? (
        <Empty kind="unsupported-network" title={t`Platform Explorer doesn't index devnets`} />
      ) : off ? (
        <Unavailable
          compact
          title={t`Platform's latest transitions and blocks need Platform Explorer`}
        />
      ) : (
        <>
          <SourceRow line={line} />
          <SourceScope value={covered}>
            <div className="rx-home__lists">
              <TransitionsCard query={transitions} shown={shownTransitions} />
              <BlocksCard query={blocks} shown={shownBlocks} />
            </div>
          </SourceScope>
        </>
      )}
    </section>
  )
}
