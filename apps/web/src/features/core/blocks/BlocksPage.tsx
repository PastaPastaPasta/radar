import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import { coreQueries } from '@/data/core/queries'
import type { BlockRow } from '@/data/core/types'
import { stampOf } from '@/data/envelope'
import { useIndexHealth } from '@/data/index-health'
import { adaptBlockRows } from '@/data/insight/adapt'
import { insQueries } from '@/data/insight/queries'
import {
  Entity,
  PageLink,
  useDocumentTitle,
  useNetwork,
  keepPreviousOnNetwork,
} from '@/features/entity'
import { formatBytes, formatDate, formatInt, formatIsoUtc } from '@/lib/format'
import { isDevnet } from '@/lib/network'
import { Card, DataTable, Empty, Hash, LockMark, SegFilter, SourceLine, Time } from '@/ui'
import { CoreBand, RecordHeader, Section } from '../block/frame'
import {
  BLOCKS_PER_PAGE,
  DAY_MS,
  FIRST_CHUNK,
  PAGE_SIZES,
  dayStartMs,
  isPageSize,
  shiftDay,
  todayUtc,
  windowOf,
  type Window,
} from './blocks-range'

/** Height ranges for the rows shown, from the DAPI tip and, for a day, the heights where that day begins and ends. */
function useRange(date: string | undefined) {
  const net = useNetwork()
  const tip = useQuery(coreQueries.tip(net))
  const start = date ? dayStartMs(date) : undefined
  const tipBlock = tip.data?.data
  // Both searches start from the tip, which the client remembers once it lands: asking before then reads it again.
  const first = useQuery({
    ...coreQueries.heightAtTime(net, start ?? 0),
    enabled: start !== undefined && tipBlock !== undefined,
  })
  const next = useQuery({
    ...coreQueries.heightAtTime(net, (start ?? 0) + DAY_MS),
    enabled: start !== undefined && tipBlock !== undefined,
  })
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
  return {
    tip,
    state: pending ? (failed ? ('error' as const) : ('loading' as const)) : ('ready' as const),
    floor: first.data?.data ?? 0,
    ceiling:
      !tipBlock || !next.data
        ? -1
        : tipBlock.time < start + DAY_MS
          ? tipBlock.height
          : next.data.data - 1,
    error: tip.error ?? first.error ?? next.error,
  }
}

/** Where a page's rows come from: DAPI block by block, or one request to an index list. */
type RowSource = 'dapi' | 'hyphen' | 'insight'

interface PageRows {
  rows: BlockRow[]
  pending: number
  stamp: ReturnType<typeof stampOf> | undefined
  error: unknown
  failed: boolean
  refetch: () => void
}

/**
 * A short page's rows in two reads, the first `FIRST_CHUNK` rows and then the rest, so the top of the table shows after
 * two rounds of block reads and not after all twenty. The rest waits for the first so it never competes with it for budget.
 */
function useDapiRows(window: Window | null, enabled: boolean): PageRows {
  const net = useNetwork()
  const head = Math.min(FIRST_CHUNK, window?.count ?? 0)
  const first = useQuery({
    ...coreQueries.blockRows(net, { fromHeight: window?.top ?? 0, count: head }),
    enabled: enabled && window !== null,
    placeholderData: keepPreviousOnNetwork(net),
  })
  const restCount = window ? window.count - head : 0
  const rest = useQuery({
    ...coreQueries.blockRows(net, { fromHeight: (window?.top ?? 0) - head, count: restCount }),
    enabled:
      enabled && window !== null && restCount > 0 && first.isSuccess && !first.isPlaceholderData,
    placeholderData: keepPreviousOnNetwork(net),
  })
  const restData = restCount > 0 && !rest.isPlaceholderData ? rest.data : undefined
  const rows = useMemo(
    () => [...(first.data?.data ?? []), ...(restData?.data ?? [])],
    [first.data, restData],
  )
  const last = rest.data && !rest.isPlaceholderData ? rest : first
  return {
    rows,
    pending: first.data && restCount > 0 && !restData && !rest.isError ? restCount : 0,
    stamp: last.data ? stampOf(last.data) : undefined,
    error: first.error ?? rest.error,
    failed: (first.isError && !first.data) || (rest.isError && !rest.data),
    refetch: () => void Promise.all([first.refetch(), rest.refetch()]),
  }
}

/** A long page from Hyphen's block list: one request for the whole page. */
function useHyphenRows(window: Window | null, enabled: boolean): PageRows {
  const net = useNetwork()
  const query = useQuery({
    ...coreQueries.blockRows(net, {
      fromHeight: window?.top ?? 0,
      count: window?.count ?? 0,
      via: 'index',
    }),
    enabled: enabled && window !== null,
    placeholderData: keepPreviousOnNetwork(net),
  })
  return {
    rows: query.data?.data ?? [],
    pending: 0,
    stamp: query.data ? stampOf(query.data) : undefined,
    error: query.error,
    failed: query.isError && !query.data,
    refetch: () => void query.refetch(),
  }
}

/**
 * A long page from Insight's day list while Hyphen's index is stale: one header read for the time the page starts at,
 * then one list request. The list orders blocks by time, so rows are kept to the page's heights, and whether each is
 * locked comes from the best ChainLock DAPI reports, with the one-node qualifier it carries.
 */
function useInsightRows(
  window: Window | null,
  enabled: boolean,
  date: string | undefined,
): PageRows {
  const net = useNetwork()
  const top = window?.top ?? 0
  const header = useQuery({
    ...coreQueries.headers(net, top, 1),
    enabled: enabled && window !== null,
  })
  const startMs = header.data?.data[0]?.time
  const day = date ?? (startMs === undefined ? undefined : formatIsoUtc(startMs).slice(0, 10))
  const list = useQuery({
    ...insQueries.blocks(net, {
      date: day ?? '',
      limit: window?.count ?? 0,
      startTimestamp: startMs === undefined ? undefined : Math.floor(startMs / 1000),
    }),
    enabled: enabled && window !== null && day !== undefined && startMs !== undefined,
    placeholderData: keepPreviousOnNetwork(net),
  })
  const lock = useQuery({ ...coreQueries.chainLock(net), enabled: enabled && window !== null })
  const best = lock.data?.data
  const rows = useMemo(() => {
    if (!list.data) return []
    return adaptBlockRows(list.data.data, top).map((r) =>
      best === undefined || r.height > best.height
        ? r
        : best.claim
          ? { ...r, chainLockClaim: 'one-node' as const }
          : { ...r, chainLocked: true },
    )
  }, [list.data, top, best])
  return {
    rows,
    pending: 0,
    stamp: list.data ? stampOf(list.data) : undefined,
    error: header.error ?? list.error,
    failed: (header.isError && !header.data) || (list.isError && !list.data),
    refetch: () => void Promise.all([header.refetch(), list.refetch()]),
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
          max={todayUtc()}
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

const requestedPageSize = (n: number | undefined) => (isPageSize(n) ? n : BLOCKS_PER_PAGE)

/** Page sizes the reader can ask for, and where a page of that size comes from. */
function usePageSource(requested: number | undefined) {
  const net = useNetwork()
  const index = useIndexHealth(net)
  const wanted = requestedPageSize(requested)
  const longPage = wanted > BLOCKS_PER_PAGE
  const hasIndex = !isDevnet(net)
  const source: RowSource = !longPage
    ? 'dapi'
    : index.readFrom === 'insight'
      ? 'insight'
      : index.state === 'fresh'
        ? 'hyphen'
        : 'dapi'
  return {
    // A long page waits for the health probe to say which index, if any, can serve it.
    waiting: longPage && hasIndex && index.pending,
    size: source === 'dapi' ? BLOCKS_PER_PAGE : wanted,
    source,
    offered: hasIndex,
    longPageAvailable: hasIndex && (index.readFrom === 'insight' || index.state === 'fresh'),
  }
}

function PageSizeControl({
  size,
  available,
  link,
}: {
  size: number
  available: boolean
  link: (size: number) => void
}) {
  const { t } = useLingui()
  return (
    <div className="rx-row" style={{ gap: 8, flexWrap: 'wrap' }} data-nav="page-size">
      <span className="rx-dim">{t`Blocks per page`}</span>
      <SegFilter
        label={t`Blocks per page`}
        value={String(size)}
        onChange={(id) => {
          link(Number(id))
        }}
        options={PAGE_SIZES.map((n) => ({
          id: String(n),
          label: formatInt(n),
          disabled: n > BLOCKS_PER_PAGE && !available,
        }))}
      />
    </div>
  )
}

export function BlocksPage({
  date,
  from,
  size: requestedSize,
}: {
  date?: string
  from?: number
  size?: number
}) {
  const { t } = useLingui()
  const navigate = useNavigate()
  const range = useRange(date)
  const pageSource = usePageSource(requestedSize)
  const size = pageSource.size
  const window =
    range.state === 'ready' && !pageSource.waiting
      ? windowOf(range.ceiling, range.floor, from, size)
      : null
  useDocumentTitle(date ? t`Blocks on ${date}` : t`Blocks`)

  const dapiRows = useDapiRows(window, pageSource.source === 'dapi')
  const hyphenRows = useHyphenRows(window, pageSource.source === 'hyphen')
  const insightRows = useInsightRows(window, pageSource.source === 'insight', date)
  const page =
    pageSource.source === 'hyphen'
      ? hyphenRows
      : pageSource.source === 'insight'
        ? insightRows
        : dapiRows
  const rows = page.rows
  const newestPage = window !== null && window.newer === null
  const today = todayUtc()
  const fresh = useFreshRows(rows, newestPage && (!date || date === today))
  const hasPool = rows.some((r) => r.pool)

  const columns = useMemo<ColumnDef<BlockRow>[]>(
    () => [
      {
        id: 'height',
        header: t`Height`,
        cell: ({ row }) => (
          <span className="rx-row" style={{ gap: 6 }}>
            <Entity kind="block" id={String(row.original.height)} />
            <LockMark locked={row.original.chainLocked} claim={row.original.chainLockClaim} />
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
        meta: { numeric: true, phone: 'secondary', phoneUnit: t`tx` },
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
              header: t`Coinbase tag says`,
              accessorFn: (r: BlockRow) => r.pool ?? '—',
              meta: { phone: 'hidden' as const },
            },
          ]
        : []),
    ],
    [t, hasPool],
  )

  const stamp = page.stamp
  const state =
    range.state === 'error' || page.failed
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

  const link = (search: { from?: number }, pageSize: number = size) => ({
    to: '/blocks' as const,
    search: {
      ...(date ? { date } : {}),
      ...(search.from === undefined ? {} : { from: search.from }),
      ...(pageSize === BLOCKS_PER_PAGE ? {} : { size: pageSize }),
    },
  })
  // An index list can come back short (a day's end, blocks out of time order), so the page after it starts at what it
  // actually reached and no block is skipped.
  const lowest = rows.length > 0 ? Math.min(...rows.map((r) => r.height)) : undefined
  const older =
    pageSource.source === 'insight' && lowest !== undefined
      ? lowest - 1 >= range.floor
        ? { from: lowest - 1 }
        : null
      : (window?.older ?? null)
  const firstOfDay = date && range.state === 'ready' ? range.floor : undefined

  return (
    <article data-page="/blocks" data-layer="core">
      <CoreBand crumbs={[{ label: t`Core` }, { label: t`Blocks` }]}>
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
                  search={{ date: today }}
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
          {pageSource.offered ? (
            <PageSizeControl
              size={requestedPageSize(requestedSize)}
              available={pageSource.longPageAvailable}
              link={(n) => void navigate(link({ from }, n) as never)}
            />
          ) : null}
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
                error={range.error ?? page.error}
                onRetry={page.refetch}
                pendingRows={page.pending}
                rowLink={(r) => ({ to: '/block/$id', params: { id: String(r.height) } })}
                live={{ newRowIds: fresh }}
                paging={
                  window
                    ? {
                        kind: 'cursor',
                        prev: window.newer ? (link(window.newer) as never) : undefined,
                        next: older ? (link(older) as never) : undefined,
                      }
                    : undefined
                }
              />
            )}
          </Card>
          {firstOfDay !== undefined && firstOfDay > 0 && window && !older ? (
            <p className="rx-note" data-nav="older-than-day">
              <Link to="/blocks" search={{ from: firstOfDay - 1 } as never}>
                {t`Older blocks from before this date`}
              </Link>
            </p>
          ) : null}
          <p className="rx-note rx-dim">{t`${formatInt(size)} blocks a page, newest first.`}</p>
        </Section>
      </div>
    </article>
  )
}
