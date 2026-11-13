import { useLingui } from '@lingui/react/macro'
import { useQueries, useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo, useState, type FormEvent } from 'react'
import type { EpochDto } from '@/data/sdk/methods'
import { sdkQueries } from '@/data/sdk/queries'
import { Entity, useNetwork } from '@/features/entity'
import { formatInt } from '@/lib/format'
import { Card, DataTable, Time } from '@/ui'
import { formatMultiplier } from './CurrentEpoch'
import { epochLengthMs } from './epoch-length'
import { queryView, stampsOf, useAfterIdle } from './state'

/** Drive answers at most this many epochs per call. */
export const EPOCH_REQUEST_CAP = 100
/** How many epochs the table shows when no range is asked for. */
export const DEFAULT_COUNT = 20
const NONE = {} as const

/**
 * The epochs a range shows, newest first, and the request for each chunk of them. A request also asks for the epoch
 * after its newest one, so that epoch's end (the next one's start) is known: a chunk shows at most 99 epochs.
 */
export function epochChunks(from: number, to: number): { first: number; shown: number }[] {
  const chunk = EPOCH_REQUEST_CAP - 1
  const out: { first: number; shown: number }[] = []
  for (let hi = to; hi >= from; hi -= chunk) {
    const first = Math.max(from, hi - chunk + 1)
    out.push({ first, shown: hi - first + 1 })
  }
  return out
}

/** The range a search asks for, held to the epochs that exist: an absent end is the current epoch or twenty back. */
export function resolveRange(
  current: number,
  from: number | undefined,
  to: number | undefined,
): { from: number; to: number; custom: boolean } {
  const hi = Math.min(current, to ?? current)
  const lo = from ?? Math.max(0, hi - DEFAULT_COUNT + 1)
  const a = Math.min(lo, hi)
  return { from: a, to: Math.max(lo, hi), custom: from !== undefined || to !== undefined }
}

interface Row {
  epoch: EpochDto
  /** The next epoch's first block time; absent for the current epoch. */
  endsAt: number | undefined
  blocks: number | undefined
}

/** NX-52: start, end and fee multiplier of a range of epochs, the latest twenty unless a range is asked for. */
export function RangeTable({ from, to }: { from?: number | undefined; to?: number | undefined }) {
  const { t } = useLingui()
  const net = useNetwork()
  const navigate = useNavigate()
  const ready = useAfterIdle()
  const [loaded, setLoaded] = useState(1)
  const tip = useQuery({ ...sdkQueries['epoch.current'](net, NONE), enabled: ready })
  const current = tip.data?.data.index
  const range = current === undefined ? undefined : resolveRange(current, from, to)
  const chunks = useMemo(() => (range ? epochChunks(range.from, range.to) : []), [range])
  const shownChunks = chunks.slice(0, loaded)
  const infos = useQueries({
    queries: shownChunks.map((c) => ({
      ...sdkQueries['epoch.epochsInfo'](net, {
        startEpoch: c.first,
        count: Math.min(EPOCH_REQUEST_CAP, c.shown + 1),
      }),
      enabled: ready,
    })),
  })
  const rows = useMemo<Row[]>(() => {
    if (!range) return []
    const byIndex = new Map<number, EpochDto>()
    for (const q of infos) for (const e of q.data?.data ?? []) byIndex.set(e.index, e)
    const out: Row[] = []
    for (let n = range.to; n >= range.from; n--) {
      const epoch = byIndex.get(n)
      if (!epoch) continue
      const next = byIndex.get(n + 1)
      out.push({
        epoch,
        endsAt: next?.firstBlockTimeMs,
        blocks: next ? next.firstBlockHeight - epoch.firstBlockHeight : undefined,
      })
    }
    return out
  }, [infos, range])
  const length = epochLengthMs(net)
  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      {
        id: 'epoch',
        header: t`Epoch`,
        cell: ({ row }) => <Entity kind="epoch" id={String(row.original.epoch.index)} />,
        meta: { phone: 'title' },
      },
      {
        id: 'start',
        header: t`Start`,
        cell: ({ row }) => <Time ms={row.original.epoch.firstBlockTimeMs} mode="absolute" />,
        meta: { phone: 'primary' },
      },
      {
        id: 'end',
        header: t`End`,
        cell: ({ row }) =>
          row.original.endsAt !== undefined ? (
            <Time ms={row.original.endsAt} mode="absolute" />
          ) : length !== undefined ? (
            <span>
              <Time ms={row.original.epoch.firstBlockTimeMs + length} mode="absolute" />{' '}
              <span className="rx-dim">{t`(estimated)`}</span>
            </span>
          ) : (
            '—'
          ),
        meta: { phone: 'secondary' },
      },
      {
        id: 'blocks',
        header: t`Blocks`,
        accessorFn: (r) => (r.blocks === undefined ? '—' : formatInt(r.blocks)),
        meta: { numeric: true, phone: 'hidden' },
      },
      {
        id: 'fees',
        header: t`Fee multiplier`,
        accessorFn: (r) => formatMultiplier(r.epoch.feeMultiplierPermille),
        meta: { numeric: true, phone: 'secondary' },
      },
    ],
    [t, length],
  )
  const pending = infos.some((q) => q.data === undefined && !q.isError)
  const failed = infos.find((q) => q.isError && q.data === undefined)
  const moreChunks = loaded < chunks.length
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    const num = (name: string): number | undefined => {
      const value = data.get(name)
      const raw = typeof value === 'string' ? value.trim() : ''
      return /^\d+$/.test(raw) ? Number(raw) : undefined
    }
    setLoaded(1)
    void navigate({
      to: '/epochs',
      search: ((prev: Record<string, unknown>) => ({
        ...prev,
        from: num('from'),
        to: num('to'),
      })) as never,
    })
  }
  return (
    <Card
      id="range"
      layer="network"
      title={t`Epochs`}
      subtitle={
        range
          ? range.custom
            ? t`Epochs ${formatInt(range.from)} to ${formatInt(range.to)}.`
            : t`The latest ${formatInt(DEFAULT_COUNT)} epochs.`
          : undefined
      }
      padding="flush"
      source={stampsOf(...infos.map((q) => q.data))}
      actions={
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={submit}
          aria-label={t`Choose a range of epochs`}
        >
          <label className="grid gap-1 text-sm">
            <span>{t`From epoch`}</span>
            <input
              className="dh-input dh-input--sm"
              name="from"
              inputMode="numeric"
              pattern="[0-9]*"
              defaultValue={from ?? ''}
              key={`from-${from ?? ''}`}
              size={7}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span>{t`To epoch`}</span>
            <input
              className="dh-input dh-input--sm"
              name="to"
              inputMode="numeric"
              pattern="[0-9]*"
              defaultValue={to ?? ''}
              key={`to-${to ?? ''}`}
              size={7}
            />
          </label>
          <button type="submit" className="dh-btn dh-btn--sm">
            {t`Show`}
          </button>
          {from !== undefined || to !== undefined ? (
            <button
              type="button"
              className="dh-btn dh-btn--sm"
              onClick={() => {
                setLoaded(1)
                void navigate({
                  to: '/epochs',
                  search: ((prev: Record<string, unknown>) => ({
                    ...prev,
                    from: undefined,
                    to: undefined,
                  })) as never,
                })
              }}
            >
              {t`Latest ${formatInt(DEFAULT_COUNT)}`}
            </button>
          ) : null}
        </form>
      }
    >
      <DataTable
        caption={t`Epochs with their start, end and fee multiplier`}
        columns={columns}
        rows={rows}
        getRowId={(r) => String(r.epoch.index)}
        {...(rows.length === 0 && failed
          ? { ...queryView(failed) }
          : { state: pending && rows.length === 0 ? ('loading' as const) : ('ready' as const) })}
        rowLink={(r) => ({ to: '/epoch/$n', params: { n: String(r.epoch.index) } })}
        empty={t`No epochs in this range.`}
        paging={
          moreChunks
            ? {
                kind: 'infinite',
                hasNext: true,
                fetching: pending,
                fetchNext: () => {
                  setLoaded((n) => n + 1)
                },
              }
            : undefined
        }
      />
    </Card>
  )
}
