import { useLingui } from '@lingui/react/macro'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import { coreQueries } from '@/data/core/queries'
import type { BlockRow } from '@/data/core/types'
import { stampOf } from '@/data/envelope'
import { Entity, PageLink, useDocumentTitle, useNetwork } from '@/features/entity'
import { formatBytes, formatDate, formatInt } from '@/lib/format'
import { Card, DataTable, Empty, Hash, Icon, SourceLine, Time } from '@/ui'
import { CoreBand, RecordHeader, Section } from '../block/frame'
import { BLOCKS_PER_PAGE, DAY_MS, dayStartMs, shiftDay, windowOf } from './blocks-range'

/** Height ranges for the rows shown, from the DAPI tip and, for a day, the heights where that day begins and ends. */
function useRange(date: string | undefined) {
  const net = useNetwork()
  const tip = useQuery(coreQueries.tip(net))
  const start = date ? dayStartMs(date) : undefined
  const first = useQuery({
    ...coreQueries.heightAtTime(net, start ?? 0),
    enabled: start !== undefined,
  })
  const next = useQuery({
    ...coreQueries.heightAtTime(net, (start ?? 0) + DAY_MS),
    enabled: start !== undefined,
  })
  const tipBlock = tip.data?.data
  if (start === undefined) {
    return {
      tip,
      state: tipBlock
        ? ('ready' as const)
        : tip.isError
          ? ('error' as const)
          : ('loading' as const),
      floor: 0,
      ceiling: tipBlock?.height ?? -1,
      error: tip.error,
    }
  }
  const pending = !tipBlock || !first.data || !next.data
  const failed =
    (tip.isError && !tip.data) || (first.isError && !first.data) || (next.isError && !next.data)
  const future = tipBlock !== undefined && start > tipBlock.time
  return {
    tip,
    state: pending ? (failed ? ('error' as const) : ('loading' as const)) : ('ready' as const),
    floor: first.data?.data ?? 0,
    ceiling:
      future || !tipBlock || !next.data
        ? -1
        : tipBlock.time < start + DAY_MS
          ? tipBlock.height
          : next.data.data - 1,
    error: tip.error ?? first.error ?? next.error,
  }
}

function useFreshRows(rows: BlockRow[], live: boolean): Set<string> {
  const [seen, setSeen] = useState<Set<string> | null>(null)
  const [fresh, setFresh] = useState<Set<string>>(() => new Set())
  if (!live) {
    if (seen !== null) setSeen(null)
    return fresh.size ? new Set() : fresh
  }
  const ids = rows.map((r) => String(r.height))
  if (ids.length > 0) {
    if (seen === null) {
      setSeen(new Set(ids))
    } else {
      const added = ids.filter((id) => !seen.has(id))
      if (added.length > 0) {
        setSeen(new Set([...seen, ...ids]))
        setFresh(new Set(added))
      }
    }
  }
  return fresh
}

function DayNav({ date, canNext }: { date: string; canNext: boolean }) {
  const { t } = useLingui()
  const navigate = useNavigate()
  const today = new Date().toISOString().slice(0, 10)
  return (
    <div className="rx-row" style={{ gap: 8, flexWrap: 'wrap' }} data-nav="day">
      <PageLink
        to="/blocks"
        search={{ date: shiftDay(date, -1) }}
        className="dh-btn"
        aria-label={t`Previous day`}
        data-nav="prev-day"
      >
        {t`← Previous day`}
      </PageLink>
      {canNext ? (
        <PageLink
          to="/blocks"
          search={{ date: shiftDay(date, 1) }}
          className="dh-btn"
          aria-label={t`Next day`}
          data-nav="next-day"
        >
          {t`Next day →`}
        </PageLink>
      ) : null}
      <label className="rx-row" style={{ gap: 6 }}>
        <span className="rx-dim">{t`Jump to a date`}</span>
        <input
          type="date"
          className="dh-input"
          value={date}
          max={today}
          min="2014-01-19"
          onChange={(e) => {
            const value = e.target.value
            if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
              void navigate({ to: '/blocks', search: { date: value } as never })
            }
          }}
        />
      </label>
    </div>
  )
}

export function BlocksPage({ date, from }: { date?: string; from?: number }) {
  const { t } = useLingui()
  const net = useNetwork()
  const range = useRange(date)
  const window = range.state === 'ready' ? windowOf(range.ceiling, range.floor, from) : null
  useDocumentTitle(date ? t`Blocks on ${date}` : t`Blocks`)

  const rowsQuery = useQuery({
    ...coreQueries.blockRows(net, { fromHeight: window?.top ?? 0, count: window?.count ?? 0 }),
    enabled: window !== null,
    placeholderData: keepPreviousData,
  })
  const rows = useMemo(() => {
    const all = rowsQuery.data?.data ?? []
    if (!date) return all
    const start = dayStartMs(date)
    return all.filter((r) => r.time >= start && r.time < start + DAY_MS)
  }, [rowsQuery.data, date])
  const newestPage = window !== null && window.newer === null
  const todayUtc = new Date().toISOString().slice(0, 10)
  const fresh = useFreshRows(rows, newestPage && (!date || date === todayUtc))
  const hasPool = rows.some((r) => r.pool)

  const columns = useMemo<ColumnDef<BlockRow>[]>(
    () => [
      {
        id: 'height',
        header: t`Height`,
        cell: ({ row }) => (
          <span className="rx-row" style={{ gap: 6 }}>
            <Entity kind="block" id={String(row.original.height)} />
            {row.original.chainLocked ? <Icon name="cl" size="sm" className="rx-lock" /> : null}
          </span>
        ),
        meta: { phone: 'title' },
      },
      {
        id: 'time',
        header: t`Time`,
        cell: ({ row }) => <Time ms={row.original.time} mode="absolute" />,
        meta: { phone: 'primary' },
      },
      {
        id: 'hash',
        header: t`Hash`,
        cell: ({ row }) => <Hash value={row.original.hash} head={8} tail={6} />,
        meta: { phone: 'hidden' },
      },
      {
        id: 'txs',
        header: t`Txs`,
        accessorFn: (r) => formatInt(r.txCount),
        meta: { numeric: true, phone: 'secondary' },
      },
      {
        id: 'size',
        header: t`Size`,
        accessorFn: (r) => formatBytes(r.size),
        meta: { numeric: true, phone: 'secondary' },
      },
      ...(hasPool
        ? [
            {
              id: 'pool',
              header: t`Mined by`,
              accessorFn: (r: BlockRow) => r.pool ?? '—',
              meta: { phone: 'hidden' as const },
            },
          ]
        : []),
    ],
    [t, hasPool],
  )

  const stamp = rowsQuery.data ? stampOf(rowsQuery.data) : undefined
  const state =
    range.state === 'error' || (rowsQuery.isError && !rowsQuery.data)
      ? 'error'
      : rows.length > 0
        ? 'ready'
        : window === null && range.state === 'ready'
          ? 'ready'
          : 'loading'
  const dateLabel = date ? formatDate(dayStartMs(date), { utc: true, time: false }) : undefined
  const tipTime = range.tip.data?.data.time
  const canNextDay =
    date !== undefined && tipTime !== undefined && dayStartMs(date) + DAY_MS <= tipTime

  const link = (search: { from?: number }) => ({
    to: '/blocks' as const,
    search: {
      ...(date ? { date } : {}),
      ...(search.from === undefined ? {} : { from: search.from }),
    },
  })
  const firstOfDay = date && range.state === 'ready' ? range.floor : undefined

  return (
    <article data-page="/blocks" data-layer="core">
      <CoreBand crumbs={[{ label: t`Core` }, { label: t`Blocks` }]} current="/blocks">
        <RecordHeader
          icon="block"
          kicker={t`Core`}
          title={dateLabel ? t`Blocks on ${dateLabel}` : t`Blocks`}
          actions={date ? <DayNav date={date} canNext={canNextDay} /> : null}
          meta={
            <div className="rx-rec__meta">
              {!date ? (
                <PageLink
                  to="/blocks"
                  search={{ date: todayUtc }}
                  className="dh-btn"
                  data-nav="by-date"
                >
                  {t`Browse by date`}
                </PageLink>
              ) : (
                <span className="rx-dim">{t`Days run from 00:00 to 24:00 UTC.`}</span>
              )}
              {stamp ? <SourceLine stamp={stamp} /> : null}
            </div>
          }
        />
      </CoreBand>

      <div className="dh-container" style={{ paddingBlock: '28px 64px' }}>
        <Section
          id="blocks"
          title={dateLabel ? t`Blocks on ${dateLabel}` : t`Latest blocks`}
          description={
            window
              ? t`Heights ${formatInt(window.top - window.count + 1)} to ${formatInt(window.top)}`
              : undefined
          }
          source={stamp}
        >
          <Card layer="core" padding="flush">
            {window === null && range.state === 'ready' ? (
              <Empty
                kind="none-yet"
                title={t`No blocks on this date`}
                body={t`This network has no blocks in this day, or the day has not happened yet.`}
              />
            ) : (
              <DataTable
                caption={dateLabel ? t`Blocks on ${dateLabel}` : t`Core blocks`}
                columns={columns}
                rows={rows}
                getRowId={(r) => String(r.height)}
                state={state}
                error={range.error ?? rowsQuery.error}
                onRetry={() => void rowsQuery.refetch()}
                rowLink={(r) => ({ to: '/block/$id', params: { id: String(r.height) } })}
                live={{ newRowIds: fresh }}
                paging={
                  window
                    ? {
                        kind: 'cursor',
                        prev: window.newer ? (link(window.newer) as never) : undefined,
                        next: window.older ? (link(window.older) as never) : undefined,
                      }
                    : undefined
                }
              />
            )}
          </Card>
          {firstOfDay !== undefined && firstOfDay > 0 && window && !window.older ? (
            <p className="rx-note" data-nav="older-than-day">
              <Link to="/blocks" search={{ from: firstOfDay - 1 } as never}>
                {t`Older blocks from before this date`}
              </Link>
            </p>
          ) : null}
          <p className="rx-note rx-dim">
            {t`${formatInt(BLOCKS_PER_PAGE)} blocks a page, newest first.`}
          </p>
        </Section>
      </div>
    </article>
  )
}
