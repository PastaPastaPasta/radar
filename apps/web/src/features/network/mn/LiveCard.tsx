import { plural } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo, type ReactNode } from 'react'
import type { SourceStamp } from '@/data/envelope'
import { Entity } from '@/features/entity'
import { formatInt } from '@/lib/format'
import { Amount, Badge, Card, DataTable, Empty, KeyValue, Time } from '@/ui'
import type { MnContext } from './mn-context'
import { stampsOf, usePlatformLive } from './mn-data'
import {
  compareEpochs,
  withdrawalOf,
  type EpochRow,
  type Withdrawal,
  type WithdrawalStatus,
} from './platform-math'

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e))

/** Figures read from Platform itself, each marked proof-checked where its call is. */
export function LiveCard({ ctx }: { ctx: MnContext }) {
  const { t } = useLingui()
  const live = usePlatformLive(ctx.net, ctx.protx)
  const { id, current, balance, thisEpoch, finalized, withdrawals } = live

  const infos = finalized.data?.data
  const radarEpochs = useMemo(
    () =>
      ctx.d?.platform_rewards?.epochs?.map((e) => ({
        epoch: e.epoch,
        blocks: e.blocks,
        credits: e.credits,
      })),
    [ctx.d],
  )
  const rows = useMemo<EpochRow[]>(
    () => (infos ? compareEpochs(infos, radarEpochs ?? [], ctx.protx) : []),
    [infos, radarEpochs, ctx.protx],
  )
  const sdkOnly = radarEpochs === undefined
  const differing = rows.filter((r) => r.matches === false)
  const checked = rows.filter((r) => r.matches !== null)
  const docs = useMemo<Withdrawal[]>(
    () =>
      (withdrawals.data?.data ?? [])
        .map(withdrawalOf)
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)),
    [withdrawals.data],
  )

  const stamps = stampsOf(
    current.data,
    balance.data,
    thisEpoch.data,
    finalized.data,
    withdrawals.data,
  )
  const answers = stamps.length
  const combined: SourceStamp | null = finalized.data
    ? {
        source: 'local',
        asOf: Math.min(...stamps.map((s) => s.asOf)),
        fetchedAt: Math.max(...stamps.map((s) => s.fetchedAt)),
        proved: false,
      }
    : null

  const failed = (e: unknown): ReactNode => (
    <span className="rx-dim">{t`couldn’t check: ${message(e)}`}</span>
  )
  const proof = <Badge tone="success">{t`proof checked`}</Badge>
  const bal = balance.data?.data.get(id)
  const mine = thisEpoch.data?.data.get(ctx.protx.toLowerCase())

  const items = [
    {
      label: t`Claimable now`,
      value: balance.isError ? (
        failed(balance.error)
      ) : balance.data ? (
        bal === null || bal === undefined ? (
          t`no identity`
        ) : (
          <>
            <Amount value={bal} kind="credits" /> {proof}
          </>
        )
      ) : (
        '…'
      ),
      hint: t`the evonode’s identity balance`,
    },
    {
      label: t`Blocks this epoch`,
      value: thisEpoch.isError ? (
        failed(thisEpoch.error)
      ) : thisEpoch.data && current.data ? (
        <>
          {t`${formatInt(Number(mine ?? 0n))} in epoch ${formatInt(current.data.data.index)}`}{' '}
          {proof}
        </>
      ) : (
        '…'
      ),
    },
    {
      label: t`Radar’s epoch numbers`,
      value: finalized.isError ? (
        failed(finalized.error)
      ) : !finalized.data ? (
        '…'
      ) : sdkOnly ? (
        <span className="rx-dim">{t`not compared: Radar’s record is not in use`}</span>
      ) : checked.length === 0 ? (
        <span className="rx-dim">{t`no epochs to compare yet`}</span>
      ) : differing.length > 0 ? (
        <Badge tone="danger">{t`differ in ${differing.map((r) => r.epoch).join(', ')}`}</Badge>
      ) : (
        <Badge tone="success">{t`match for ${plural(checked.length, { one: '# epoch', other: '# epochs' })}`}</Badge>
      ),
    },
  ]

  const radarColumns: ColumnDef<EpochRow>[] = [
    {
      id: 'radar',
      header: t`Radar’s record`,
      cell: ({ row }) =>
        row.original.radarPaid === null ? (
          '—'
        ) : (
          <>
            <Amount value={row.original.radarPaid} kind="credits" />
            {', '}
            {formatInt(row.original.radarBlocks ?? 0)}
          </>
        ),
      meta: { align: 'end', numeric: true, phone: 'secondary' },
    },
    {
      id: 'verdict',
      header: t`Verdict`,
      cell: ({ row }) =>
        row.original.matches === null ? (
          '—'
        ) : (
          <Badge tone={row.original.matches ? 'success' : 'danger'}>
            {row.original.matches ? t`match` : t`differ`}
          </Badge>
        ),
      meta: { phone: 'hidden' },
    },
  ]
  const compareColumns = useMemo<ColumnDef<EpochRow>[]>(
    () => [
      {
        id: 'epoch',
        header: t`Epoch`,
        cell: ({ row }) => (
          <Entity
            kind="epoch"
            id={String(row.original.epoch)}
            label={formatInt(row.original.epoch)}
          />
        ),
        meta: { phone: 'title' },
      },
      {
        id: 'blocks',
        header: t`Blocks (proofs)`,
        cell: ({ row }) => formatInt(Number(row.original.sdkBlocks)),
        meta: { align: 'end', numeric: true },
      },
      {
        id: 'paid',
        header: t`Paid (proofs)`,
        cell: ({ row }) => <Amount value={row.original.sdkPaid} kind="credits" />,
        meta: { align: 'end', numeric: true, phone: 'primary' },
      },
      ...(sdkOnly ? [] : radarColumns),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- radarColumns follows t and sdkOnly
    [t, sdkOnly],
  )

  const statusLabel = (s: WithdrawalStatus): string => {
    switch (s) {
      case 'queued':
        return t`Queued`
      case 'pooled':
        return t`Pooled`
      case 'broadcast':
        return t`Broadcast`
      case 'complete':
        return t`Complete`
      case 'expired':
        return t`Expired (refunded)`
      case 'unknown':
        return t`Unknown`
    }
  }
  const withdrawalColumns = useMemo<ColumnDef<Withdrawal>[]>(
    () => [
      {
        id: 'requested',
        header: t`Requested`,
        cell: ({ row }) =>
          row.original.createdAt === null ? (
            '—'
          ) : (
            <Time ms={row.original.createdAt} mode="absolute" />
          ),
        meta: { phone: 'title' },
      },
      {
        id: 'amount',
        header: t`Amount`,
        cell: ({ row }) => <Amount value={row.original.amount} kind="credits" />,
        meta: { align: 'end', numeric: true, phone: 'primary' },
      },
      {
        id: 'status',
        header: t`Status`,
        cell: ({ row }) => (
          <Badge
            tone={
              row.original.status === 'complete'
                ? 'success'
                : row.original.status === 'expired'
                  ? 'danger'
                  : 'neutral'
            }
          >
            {statusLabel(row.original.status)}
          </Badge>
        ),
        meta: { phone: 'secondary' },
      },
      {
        id: 'updated',
        header: t`Updated`,
        cell: ({ row }) =>
          row.original.updatedAt === null ? (
            '—'
          ) : (
            <Time ms={row.original.updatedAt} mode="absolute" />
          ),
        meta: { phone: 'hidden' },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- statusLabel only closes over t
    [t],
  )

  const done = docs.filter((w) => w.status !== 'expired').reduce((sum, w) => sum + w.amount, 0n)
  return (
    <Card
      title={t`Live from Platform`}
      layer="platform"
      source={combined ? [...stamps, combined] : stamps}
      id="platform-live"
      subtitle={t`Read from Platform with proofs, checked in your browser`}
    >
      <div className="grid gap-5">
        <KeyValue items={items} />
        <div data-epoch-comparison>
          <h4 className="rx-sm rx-dim">{t`The last 12 epochs`}</h4>
          {rows.length > 0 ? (
            <>
              <DataTable
                caption={t`Blocks and rewards of the last 12 finalized epochs, from Platform’s proofs`}
                columns={compareColumns}
                rows={rows}
                getRowId={(r) => String(r.epoch)}
                state="ready"
              />
              <p className="rx-dim rx-sm" data-combined>
                {t`Combined from ${plural(answers, { one: '# proof-checked answer', other: '# proof-checked answers' })}: the finalized epochs, the current epoch and this evonode’s proposed blocks.`}
              </p>
            </>
          ) : finalized.isPending || current.isPending ? (
            <p className="rx-dim">{t`Loading the Platform SDK (once per visit)…`}</p>
          ) : (
            <Empty kind="none-yet" title={t`No finalized epochs came back to compare.`} />
          )}
        </div>
        <div data-withdrawals>
          <h4 className="rx-sm rx-dim">{t`Withdrawals`}</h4>
          {withdrawals.isError ? (
            <p className="rx-dim">{t`Couldn’t list withdrawals: ${message(withdrawals.error)}`}</p>
          ) : withdrawals.isPending ? (
            <p className="rx-dim">…</p>
          ) : docs.length === 0 ? (
            <p className="rx-dim">{t`None yet: everything it earned is still claimable.`}</p>
          ) : (
            <>
              <p className="rx-dim rx-sm">
                {t`${plural(docs.length, { one: '# withdrawal', other: '# withdrawals' })}${docs.length >= 100 ? '+' : ''}, `}
                <Amount value={done} kind="credits" /> {t`in total (not counting expired ones).`}
              </p>
              <DataTable
                caption={t`Withdrawals from this evonode’s identity`}
                columns={withdrawalColumns}
                rows={docs.slice(0, 50)}
                getRowId={(w) => w.id}
                state="ready"
              />
            </>
          )}
        </div>
      </div>
    </Card>
  )
}
