import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { Link, Navigate, useNavigate, useSearch } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import type { FinalizedEpochDto } from '@/data/sdk/methods'
import { sdkQueries } from '@/data/sdk/queries'
import { Entity, PageFrame, PageLink, useNetwork } from '@/features/entity'
import { formatMultiplier } from '@/features/network/epochs/CurrentEpoch'
import { queryView, sortRows, stampsOf, useAfterIdle } from '@/features/network/epochs/state'
import { formatInt, formatPercent } from '@/lib/format'
import { Amount, Card, DataTable, Empty, KeyValue, Time } from '@/ui'

const NONE = {} as const
const PAGE = 50

interface Row {
  proTxHash: string
  blocks: bigint
  rank: number
  share: number
}

const parseEpoch = (n: string): number | undefined => (/^\d{1,9}$/.test(n) ? Number(n) : undefined)

/** NX-51: one past epoch: its finalized totals, its proposers and the epochs on either side. */
export function EpochPage({ n }: { n: string }) {
  const { t } = useLingui()
  const net = useNetwork()
  const index = parseEpoch(n)
  const ready = useAfterIdle()
  const tip = useQuery({ ...sdkQueries['epoch.current'](net, NONE), enabled: ready })
  const current = tip.data?.data.index
  const title = index === undefined ? t`Epoch` : t`Epoch ${formatInt(index)}`

  if (index !== undefined && current !== undefined && index === current) {
    return <Navigate to="/epochs" replace />
  }

  return (
    <PageFrame
      path="/epoch/$n"
      title={title}
      eyebrow={t`Network`}
      layer="network"
      lede={t`One finalized Platform epoch: its totals, who proposed its blocks, and the epochs on either side.`}
      share
    >
      {index === undefined ? (
        <Empty
          kind="not-found"
          title={t`That is not an epoch number`}
          body={t`An epoch is a whole number, such as 88.`}
          action={
            <PageLink to="/epochs" className="rx-go">
              {t`All epochs`}
            </PageLink>
          }
        />
      ) : current === undefined ? (
        <Card
          id="epoch-totals"
          layer="network"
          title={t`Totals`}
          source={stampsOf(tip.data)}
          {...queryView(tip)}
        >
          {null}
        </Card>
      ) : index > current ? (
        <Empty
          kind="none-yet"
          title={t`Epoch ${formatInt(index)} has not started`}
          body={t`The current epoch is ${formatInt(current)}.`}
          action={
            <PageLink to="/epochs" className="rx-go">
              {t`Current epoch`}
            </PageLink>
          }
        />
      ) : (
        <PastEpoch index={index} />
      )}
    </PageFrame>
  )
}

function Neighbours({ index }: { index: number }) {
  const { t } = useLingui()
  return (
    <nav className="flex flex-wrap items-center gap-2" aria-label={t`Neighbouring epochs`}>
      {index > 0 ? (
        <Link
          to="/epoch/$n"
          params={{ n: String(index - 1) }}
          className="dh-btn dh-btn--sm"
          rel="prev"
        >
          {t`Previous epoch`}
        </Link>
      ) : (
        <span className="dh-btn dh-btn--sm" aria-disabled="true">
          {t`Previous epoch`}
        </span>
      )}
      <Link
        to="/epoch/$n"
        params={{ n: String(index + 1) }}
        className="dh-btn dh-btn--sm"
        rel="next"
      >
        {t`Next epoch`}
      </Link>
      <PageLink to="/epochs" className="rx-go">
        {t`All epochs`}
      </PageLink>
    </nav>
  )
}

function PastEpoch({ index }: { index: number }) {
  const { t } = useLingui()
  const net = useNetwork()
  const finalized = useQuery(
    sdkQueries['epoch.finalizedInfos'](net, { startEpoch: index, count: 1 }),
  )
  const span = useQuery(sdkQueries['epoch.epochsInfo'](net, { startEpoch: index, count: 2 }))
  const info = finalized.data?.data.find((e) => e.index === index)
  const next = span.data?.data.find((e) => e.index === index + 1)
  return (
    <>
      <Neighbours index={index} />
      {finalized.data && !info ? (
        <Empty
          kind="none-yet"
          title={t`Epoch ${formatInt(index)} has no finalized totals`}
          body={t`Platform keeps totals only for epochs that have been finalized, and this network has none for this number.`}
        />
      ) : (
        <>
          <Card
            id="epoch-totals"
            layer="network"
            title={t`Totals`}
            subtitle={t`Final once the epoch ended.`}
            source={stampsOf(finalized.data, span.data)}
            {...queryView(finalized)}
          >
            {info ? <Totals info={info} endsAt={next?.firstBlockTimeMs} /> : null}
          </Card>
          <EpochProposers
            info={info}
            source={stampsOf(finalized.data)}
            state={queryView(finalized)}
          />
        </>
      )}
    </>
  )
}

function Totals({ info, endsAt }: { info: FinalizedEpochDto; endsAt: number | undefined }) {
  const { t } = useLingui()
  return (
    <KeyValue
      columns={2}
      items={[
        { label: t`Started`, value: <Time ms={info.firstBlockTimeMs} mode="absolute" /> },
        {
          label: t`Ended`,
          value: endsAt === undefined ? '—' : <Time ms={endsAt} mode="absolute" />,
        },
        {
          label: t`First block`,
          value: <Entity kind="platform-block" id={String(info.firstBlockHeight)} />,
        },
        { label: t`Blocks`, value: formatInt(info.totalBlocks) },
        { label: t`Proposers`, value: formatInt(info.blockProposers.size) },
        {
          label: t`Core block rewards`,
          value: <Amount value={info.coreBlockRewards} kind="credits" compact />,
        },
        {
          label: t`Processing fees`,
          value: <Amount value={info.totalProcessingFees} kind="credits" compact />,
        },
        {
          label: t`Storage fees distributed`,
          value: <Amount value={info.totalDistributedStorageFees} kind="credits" compact />,
        },
        {
          label: t`Storage fees created`,
          value: <Amount value={info.totalCreatedStorageFees} kind="credits" compact />,
        },
        { label: t`Fee multiplier`, value: formatMultiplier(info.feeMultiplierPermille) },
        { label: t`Protocol version`, value: `v${info.protocolVersion}` },
      ]}
    />
  )
}

function EpochProposers({
  info,
  source,
  state,
}: {
  info: FinalizedEpochDto | undefined
  source: ReturnType<typeof stampsOf>
  state: ReturnType<typeof queryView>
}) {
  const { t } = useLingui()
  const { sort } = useSearch({ from: '/epoch/$n' })
  const navigate = useNavigate()
  const [shown, setShown] = useState(PAGE)
  const all = useMemo<Row[]>(() => {
    if (!info) return []
    const total = Number(info.totalBlocks)
    return [...info.blockProposers]
      .map(([proTxHash, blocks]) => ({ proTxHash, blocks }))
      .sort((a, b) => (a.blocks === b.blocks ? 0 : a.blocks > b.blocks ? -1 : 1))
      .map((p, i) => ({ ...p, rank: i + 1, share: total === 0 ? 0 : Number(p.blocks) / total }))
  }, [info])
  const sorted = useMemo(
    () =>
      sortRows(all, sort, {
        rank: (r) => r.rank,
        node: (r) => r.proTxHash,
        blocks: (r) => r.blocks,
        share: (r) => r.share,
      }),
    [all, sort],
  )
  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      {
        id: 'rank',
        header: '#',
        accessorFn: (r) => r.rank,
        meta: { numeric: true, phone: 'hidden' },
      },
      {
        id: 'node',
        header: t`Evonode`,
        accessorFn: (r) => r.proTxHash,
        cell: ({ row }) => <Entity kind="evonode" id={row.original.proTxHash} />,
        meta: { phone: 'title' },
      },
      {
        id: 'blocks',
        header: t`Blocks`,
        accessorFn: (r) => formatInt(Number(r.blocks)),
        meta: { numeric: true, phone: 'primary', phoneUnit: t`blocks` },
      },
      {
        id: 'share',
        header: t`Share`,
        accessorFn: (r) => formatPercent(r.share, 1),
        meta: { numeric: true, phone: 'secondary' },
      },
    ],
    [t],
  )
  return (
    <Card
      id="epoch-proposers"
      layer="network"
      title={t`Proposers`}
      subtitle={
        info
          ? t`${formatInt(all.length)} evonodes proposed the epoch’s ${formatInt(info.totalBlocks)} blocks.`
          : undefined
      }
      padding="flush"
      source={source}
    >
      <DataTable
        caption={t`Proposers of this epoch`}
        columns={columns}
        rows={sorted.slice(0, shown)}
        getRowId={(r) => r.proTxHash}
        sort={{
          value: sort,
          onChange: (next) => {
            setShown(PAGE)
            void navigate({
              to: '.',
              search: ((prev: Record<string, unknown>) => ({ ...prev, sort: next })) as never,
            })
          },
        }}
        {...state}
        empty={t`No evonode proposed a block in this epoch.`}
        paging={
          shown < sorted.length
            ? {
                kind: 'infinite',
                hasNext: true,
                fetching: false,
                fetchNext: () => {
                  setShown((n) => n + PAGE)
                },
              }
            : undefined
        }
      />
    </Card>
  )
}
