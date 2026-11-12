import { plural } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'
import { coreQueries } from '@/data/core/queries'
import type { DecodedBlock, DecodedTx } from '@/data/core/types'
import { stampOf } from '@/data/envelope'
import { Entity, useDocumentTitle, useNetwork } from '@/features/entity'
import { hyQueries } from '@/data/hyphen/queries'
import { HyphenOnlyNote } from './HyphenOnlyNote'
import { formatBytes, formatInt, withUnit } from '@/lib/format'
import {
  Amount,
  Card,
  DataTable,
  Hash,
  Icon,
  KeyValue,
  SourceLine,
  Stat,
  Time,
  TypeBadge,
  ChainLockBadge,
} from '@/ui'
import { blockReward, cbTxOf, coinbaseTag, difficultyFromBits, poolOf } from './block-info'
import { Difficulty } from '../hy-shared/Difficulty'
import { CbTxRows } from '../tx/Payload'
import { useFollowTip } from '../follow-tip'
import { sumOutputs } from '../tx/tx-info'
import { CoreBand, CoreBandSkeleton, NotFound, RecordHeader, Section } from './frame'
import { useHyphenFit } from '@/data/hyphen/fit'
import { parseBlockRef } from '@/lib/core/block-ref'

export const TXS_PER_PAGE = 100

export function BlockPage({ id, page = 1 }: { id: string; page?: number }) {
  const { t } = useLingui()
  const net = useNetwork()
  const ref = parseBlockRef(id)
  useDocumentTitle(ref && 'height' in ref ? t`Block ${formatInt(ref.height)}` : t`Block`)
  const block = useQuery({ ...coreQueries.block(net, ref ?? { height: 0 }), enabled: ref !== null })
  const tipHeight = useFollowTip(net, {
    key: coreQueries.block(net, ref ?? { height: 0 }).queryKey,
    settled: block.data?.data?.chainLocked === true,
    enabled: ref !== null,
  })

  if (!ref || block.data?.data === null) {
    return (
      <NotFound
        title={t`Block`}
        net={net}
        path={`/block/${id}`}
        what={t`There is no block with this height or hash on this network.`}
      />
    )
  }
  if (block.isError && !block.data) {
    return (
      <div className="dh-container" style={{ paddingBlock: '48px 80px' }}>
        <Card
          layer="core"
          source={undefined}
          state="error"
          error={block.error}
          onRetry={() => void block.refetch()}
        >
          {null}
        </Card>
      </div>
    )
  }
  if (!block.data?.data) return <CoreBandSkeleton />

  return (
    <BlockView
      block={block.data.data}
      stamp={stampOf(block.data)}
      tipHeight={tipHeight}
      page={page}
    />
  )
}

const pageLink = (id: string, page: number) =>
  ({
    to: '/block/$id',
    params: { id },
    search: (s: Record<string, unknown>) => ({ ...s, page: page === 1 ? undefined : page }),
  }) as never

function BlockView({
  block,
  stamp,
  tipHeight,
  page,
}: {
  block: DecodedBlock
  stamp: ReturnType<typeof stampOf>
  tipHeight: number | undefined
  page: number
}) {
  const { t } = useLingui()
  const net = useNetwork()
  const hyphenFit = useHyphenFit(net)
  const hy = useQuery({ ...hyQueries.block(net, block.hash), enabled: hyphenFit })
  const coinbase = block.txs[0]
  const pool = poolOf(coinbase)
  const tag = coinbaseTag(coinbase)
  const reward = blockReward(block)
  const cb = cbTxOf(block)
  const confirmations =
    tipHeight === undefined ? undefined : Math.max(1, tipHeight - block.height + 1)
  const hasNext = tipHeight !== undefined && block.height < tipHeight
  const pages = Math.max(1, Math.ceil(block.txs.length / TXS_PER_PAGE))
  const current = Math.min(Math.max(1, page), pages)
  const offset = (current - 1) * TXS_PER_PAGE
  const quorumCommitments = block.txs.filter((x) => x.type === 'quorum-commitment').length
  const chainwork = hy.data?.data?.chainwork

  const columns = useMemo<ColumnDef<DecodedTx & { n: number }>[]>(
    () => [
      { id: 'n', header: '#', accessorFn: (r) => r.n, meta: { numeric: true, phone: 'secondary' } },
      {
        id: 'tx',
        header: t`Transaction`,
        cell: ({ row }) => <Entity kind="tx" id={row.original.txid} />,
        meta: { phone: 'title' },
      },
      {
        id: 'type',
        header: t`Type`,
        cell: ({ row }) => <TypeBadge type={row.original.type} />,
        meta: { phone: 'primary' },
      },
      {
        id: 'io',
        header: t`Inputs → outputs`,
        accessorFn: (r) => `${formatInt(r.inputs.length)} → ${formatInt(r.outputs.length)}`,
        meta: { numeric: true, phone: 'secondary' },
      },
      {
        id: 'size',
        header: t`Size`,
        accessorFn: (r) => formatBytes(r.size),
        meta: { numeric: true, phone: 'secondary' },
      },
      {
        id: 'out',
        header: t`Total out`,
        cell: ({ row }) => <Amount value={sumOutputs(row.original)} kind="duffs" />,
        meta: { numeric: true, align: 'end' },
      },
    ],
    [t],
  )
  const rows = useMemo(
    () => block.txs.slice(offset, offset + TXS_PER_PAGE).map((x, i) => ({ ...x, n: offset + i })),
    [block.txs, offset],
  )

  return (
    <article data-page="/block/$id" data-layer="core">
      <CoreBand
        crumbs={[
          { label: t`Core`, to: <Link to="/blocks">{t`Core`}</Link> },
          { label: t`Block ${formatInt(block.height)}` },
        ]}
      >
        <RecordHeader
          icon="block"
          kicker={
            <>
              <span className="rx-type" data-layer="core">
                <Icon name="block" />
                {t`Block`}
              </span>
              <span>
                {t`Version ${block.version.toString(16)}`} ·{' '}
                {plural(block.txs.length, { one: '# transaction', other: '# transactions' })}
              </span>
            </>
          }
          title={t`Block ${formatInt(block.height)}`}
          actions={
            <>
              {block.height > 0 ? (
                <Link
                  className="dh-btn"
                  to="/block/$id"
                  params={{ id: block.prevHash }}
                  aria-label={t`Previous block`}
                  data-nav="prev"
                >
                  {t`← Previous`}
                </Link>
              ) : null}
              {hasNext ? (
                <Link
                  className="dh-btn"
                  to="/block/$id"
                  params={{ id: String(block.height + 1) }}
                  aria-label={t`Next block`}
                  data-nav="next"
                >
                  {t`Next →`}
                </Link>
              ) : null}
            </>
          }
          meta={
            <>
              <div className="rx-rec__meta">
                <span className="rx-dim">{t`Hash`}</span>
                <Hash value={block.hash} display="full" />
              </div>
              <div className="rx-rec__meta">
                <ChainLockBadge
                  locked={block.chainLocked}
                  claim={block.chainLockClaim}
                  unlockedLabel={t`Not ChainLocked yet`}
                />
                {confirmations === undefined ? null : (
                  <span>
                    {plural(confirmations, { one: '# confirmation', other: '# confirmations' })}
                  </span>
                )}
                <SourceLine stamp={stamp} />
              </div>
            </>
          }
        />
        <div className="rx-kpis">
          <Stat
            size="lg"
            layer="core"
            label={t`Transactions`}
            value={formatInt(block.txs.length)}
            note={formatBytes(block.size)}
          />
          <Stat
            label={t`Block reward`}
            value={<Amount value={reward} kind="duffs" />}
            note={t`Everything the coinbase pays out`}
          />
          <Stat
            label={t`Coinbase tag says`}
            value={
              <span className="whitespace-normal [overflow-wrap:anywhere]">
                {pool ?? t`No known pool`}
              </span>
            }
            note={
              tag
                ? t`Tag: ${tag}. The miner writes it, so it is not proof.`
                : t`No tag in the coinbase`
            }
          />
          <Stat
            label={t`Time`}
            value={<Time ms={block.time} mode="relative" live />}
            note={<Time ms={block.time} mode="absolute" />}
          />
        </div>
      </CoreBand>

      <div className="dh-container" style={{ paddingBlock: '28px 64px' }}>
        <Section id="header" title={t`Header`} source={stamp}>
          <HyphenOnlyNote what={t`Chainwork`} />
          <Card layer="core">
            <KeyValue
              columns={2}
              items={[
                { label: t`Height`, value: formatInt(block.height) },
                { label: t`Time`, value: <Time ms={block.time} mode="both" /> },
                { label: t`Size`, value: withUnit(formatInt(block.size), t`bytes`) },
                {
                  label: t`Difficulty`,
                  value: <Difficulty value={difficultyFromBits(block.bits)} significant={6} />,
                },
                { label: t`Bits`, value: <span className="rx-mono">{block.bits}</span> },
                { label: t`Nonce`, value: formatInt(block.nonce) },
                {
                  label: t`Merkle root`,
                  value: <Hash value={block.merkleRoot} display="wrap" phoneShort />,
                },
                {
                  label: t`Chainwork`,
                  value: chainwork ? (
                    <Hash value={chainwork} display="wrap" phoneShort />
                  ) : (
                    <span className="rx-dim">{t`Not in DAPI`}</span>
                  ),
                  source: hy.data ? stampOf(hy.data) : undefined,
                },
                {
                  label: t`Version`,
                  value: <span className="rx-mono">{block.version.toString(16)}</span>,
                },
                ...(block.height > 0
                  ? [
                      {
                        label: t`Previous block`,
                        value: (
                          <Entity
                            kind="block"
                            id={block.prevHash}
                            label={t`Block ${formatInt(block.height - 1)}`}
                          />
                        ),
                      },
                    ]
                  : []),
              ]}
            />
          </Card>
        </Section>

        {cb ? (
          <Section
            id="coinbase"
            title={t`Coinbase payload`}
            description={t`Dash adds a payload to the coinbase that commits to the masternode list and the latest ChainLock.`}
            source={stamp}
          >
            <Card layer="core">
              <div data-payload="cbTx">
                <CbTxRows payload={cb} />
                {quorumCommitments > 0 ? (
                  <p className="rx-note">
                    {plural(quorumCommitments, {
                      one: '# quorum commitment in this block',
                      other: '# quorum commitments in this block',
                    })}
                  </p>
                ) : null}
              </div>
            </Card>
          </Section>
        ) : null}

        <Section
          id="transactions"
          title={t`Transactions`}
          description={plural(block.txs.length, { one: '# transaction', other: '# transactions' })}
          source={stamp}
        >
          <Card layer="core" padding="flush">
            <DataTable
              caption={t`Transactions in block ${formatInt(block.height)}`}
              columns={columns}
              rows={rows}
              getRowId={(r) => r.txid}
              state="ready"
              paging={
                pages > 1
                  ? {
                      kind: 'page',
                      page: current,
                      limit: TXS_PER_PAGE,
                      total: block.txs.length,
                      to: (p) => pageLink(String(block.height), p),
                    }
                  : undefined
              }
              rowLink={(r) => ({ to: '/tx/$txid', params: { txid: r.txid } })}
            />
          </Card>
        </Section>
      </div>
    </article>
  )
}
