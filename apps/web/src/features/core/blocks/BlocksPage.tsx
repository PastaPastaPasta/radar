import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import { coreQueries } from '@/data/core/queries'
import type { BlockRow } from '@/data/core/types'
import { stampOf, type SourceStamp } from '@/data/envelope'
import { insQueries } from '@/data/insight/queries'
import { useIndexHealth } from '@/data/index-health'
import {
  Entity,
  PageLink,
  useDocumentTitle,
  useNetwork,
  keepPreviousOnNetwork,
} from '@/features/entity'
import { formatBytes, formatDate, formatInt } from '@/lib/format'
import { isDevnet } from '@/lib/network'
import { Card, DataTable, Empty, Hash, LockMark, SegFilter, SourceLine, Time } from '@/ui'
import { CoreBand, RecordHeader, Section } from '../block/frame'
import {
  BLOCKS_PER_PAGE,
  DAY_MS,
  FIRST_CHUNK,
  PAGE_SIZES,
  chunksOf,
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
      provisional: false,
      found: 0,
    }
  }
  // A day still in progress ends at the tip, so its end needs no search.
  const open = tipBlock !== undefined && tipBlock.time < start + DAY_MS
  const endFound = open || next.data !== undefined
  const ceilingKnown = tipBlock !== undefined && endFound
  const failed =
    (tip.isError && !tip.data) || (first.isError && !first.data) || (next.isError && !next.data)
  const ready = ceilingKnown && first.data !== undefined
  return {
    tip,
    state: ready ? ('ready' as const) : failed ? ('error' as const) : ('loading' as const),
    floor: first.data?.data ?? 0,
    ceiling: !ceilingKnown ? -1 : open ? tipBlock.height : (next.data?.data ?? 0) - 1,
    error: tip.error ?? first.error ?? next.error,
    /** The day's last block is known and its first is still being searched for: the newest rows can already be read. */
    provisional: ceilingKnown && !ready && !failed,
    /** How many of the day's two ends have been found, for the progress line. */
    found: (first.data !== undefined ? 1 : 0) + (endFound ? 1 : 0),
  }
}

/** Where a page's rows come from: DAPI block by block, or one request to an index list. */
type RowSource = 'dapi' | 'hyphen' | 'insight'

interface PageRows {
  rows: BlockRow[]
  /** The page's reads have finished and answered, whatever they held. */
  settled: boolean
  pending: number
  stamp: SourceStamp | undefined
  error: unknown
  failed: boolean
  refetch: () => void
}

/**
 * A short page's rows in up to `MAX_DAPI_READS` (three) reads, the first `FIRST_CHUNK` rows and then `NEXT_CHUNK` at a time, so the top of
 * the table shows after two rounds of block reads and the rest fills in as it arrives. Each read waits for the one
 * before it, so they never compete for budget.
 */
function useDapiRows(window: Window | null, enabled: boolean): PageRows {
  const net = useNetwork()
  const on = enabled && window !== null
  const top = window?.top ?? 0
  const none = { offset: 0, count: 0 }
  const [a = none, b = none, c = none] = chunksOf(window?.count ?? 0)
  const read = (chunk: { offset: number; count: number }, after: boolean) => ({
    ...coreQueries.blockRows(net, { fromHeight: top - chunk.offset, count: chunk.count }),
    enabled: on && chunk.count > 0 && after,
    placeholderData: keepPreviousOnNetwork(net),
  })
  const landed = (q: { isSuccess: boolean; isPlaceholderData: boolean }) =>
    q.isSuccess && !q.isPlaceholderData
  const first = useQuery(read(a, true))
  const second = useQuery(read(b, landed(first)))
  const third = useQuery(read(c, landed(first) && landed(second)))
  const reads = [first, second, third].slice(0, [a, b, c].filter((x) => x.count > 0).length)
  const held = reads.findIndex((q) => !landed(q))
  const shown = reads.slice(0, held === -1 ? reads.length : held)
  // The first read's rows stay up as a placeholder while a new page of the same network loads.
  const visible = shown.length > 0 ? shown : first.data ? [first] : []
  const rows = useMemo(
    () => visible.flatMap((q) => q.data?.data ?? []),
    // `visible` is a new array every render; the data each read holds is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [first.data, second.data, third.data, visible.length],
  )
  const loaded = shown.reduce((n, q) => n + (q.data?.data.length ?? 0), 0)
  const failedRead = reads.find((q) => q.isError && !q.data)
  const last = visible.at(-1)
  return {
    rows,
    settled: reads.length > 0 && held === -1,
    pending: shown.length > 0 && !failedRead ? Math.max(0, (window?.count ?? 0) - loaded) : 0,
    stamp: last?.data ? stampOf(last.data) : undefined,
    error: reads.find((q) => q.error)?.error ?? null,
    failed: failedRead !== undefined,
    refetch: () => void Promise.all(reads.map((q) => q.refetch())),
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
    settled: query.isSuccess && !query.isPlaceholderData,
    pending: 0,
    stamp: query.data ? stampOf(query.data) : undefined,
    error: query.error,
    failed: query.isError && !query.data,
    refetch: () => void query.refetch(),
  }
}

/**
 * A long page from Insight's day list while Hyphen's index is stale (`readInsightPage` joins the day requests it takes),
 * with whether each row is locked taken from the best ChainLock DAPI reports and the one-node qualifier it carries.
 */
function useInsightRows(window: Window | null, enabled: boolean): PageRows {
  const net = useNetwork()
  const top = window?.top ?? 0
  const count = window?.count ?? 0
  const page = useQuery({
    ...insQueries.blocksPage(net, { top, count }),
    enabled: enabled && window !== null,
    placeholderData: keepPreviousOnNetwork(net),
  })
  const lock = useQuery({ ...coreQueries.chainLock(net), enabled: enabled && window !== null })
  const best = lock.data?.data
  const rows = useMemo(
    () =>
      (page.data?.rows ?? []).map((r) =>
        best === undefined || r.height > best.height
          ? r
          : best.claim
            ? { ...r, chainLockClaim: 'one-node' as const }
            : { ...r, chainLocked: true },
      ),
    [page.data, best],
  )
  return {
    rows,
    settled: page.isSuccess && !page.isPlaceholderData,
    pending: 0,
    stamp: page.data ? stampOf(page.data.list) : undefined,
    error: page.error,
    failed: page.isError && !page.data,
    refetch: () => void page.refetch(),
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
    requested: wanted,
    size: source === 'dapi' ? BLOCKS_PER_PAGE : wanted,
    source,
    offered: hasIndex,
    longPageAvailable: hasIndex && (index.readFrom === 'insight' || index.state === 'fresh'),
    /** Decentralized only mode: no index is asked, so only DAPI's page size is on offer. */
    off: index.off,
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
  // While the day's first block is still being searched for, its newest rows are read already: the same read the
  // finished page starts with, so nothing is asked twice.
  const early =
    range.provisional && from === undefined && pageSource.source === 'dapi' && range.ceiling >= 0
  const window: Window | null =
    range.state === 'ready' && !pageSource.waiting
      ? windowOf(range.ceiling, range.floor, from, size)
      : early
        ? {
            top: range.ceiling,
            count: Math.min(FIRST_CHUNK, range.ceiling + 1),
            newer: null,
            older: null,
          }
        : null
  useDocumentTitle(date ? t`Blocks on ${date}` : t`Blocks`)

  const dapiRows = useDapiRows(window, pageSource.source === 'dapi')
  const hyphenRows = useHyphenRows(window, pageSource.source === 'hyphen')
  const insightRows = useInsightRows(window, pageSource.source === 'insight')
  const page = { dapi: dapiRows, hyphen: hyphenRows, insight: insightRows }[pageSource.source]
  const dayStart = date ? dayStartMs(date) : 0
  // Until the day's first block is known, a row is shown only if its own time puts it in the day.
  const rows = useMemo(
    () => (early ? page.rows.filter((r) => r.time >= dayStart) : page.rows),
    [early, page.rows, dayStart],
  )
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
  const noBlocks = window === null && range.state === 'ready' && !pageSource.waiting
  const shownEmpty = window !== null && !early && page.settled && rows.length === 0
  const state =
    range.state === 'error' || page.failed
      ? 'error'
      : rows.length > 0 || noBlocks
        ? 'ready'
        : 'loading'
  const dateLabel = date ? formatDate(dayStartMs(date), { utc: true, time: false }) : undefined
  const tipTime = range.tip.data?.data.time
  const canNextDay =
    date !== undefined && tipTime !== undefined && dayStartMs(date) + DAY_MS <= tipTime

  const link = (search: { from?: number }, pageSize: number = pageSource.requested) => ({
    to: '/blocks' as const,
    search: {
      ...(date ? { date } : {}),
      ...(search.from === undefined ? {} : { from: search.from }),
      ...(pageSize === BLOCKS_PER_PAGE ? {} : { size: pageSize }),
    },
  })
  // A page read from Insight can come back short of its window (see `readInsightPage`), so the page after it starts at
  // the lowest height it shows and no block is skipped.
  const heights = rows.map((r) => r.height)
  const lowest = heights.length > 0 ? Math.min(...heights) : undefined
  const older =
    pageSource.source === 'insight' && lowest !== undefined && page.settled
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
            lowest !== undefined && page.pending === 0 && !early
              ? t`Heights ${formatInt(lowest)} to ${formatInt(Math.max(...heights))}`
              : undefined
          }
          source={stamp}
        >
          {pageSource.offered ? (
            <PageSizeControl
              size={pageSource.waiting ? pageSource.requested : size}
              available={pageSource.longPageAvailable}
              link={(n) => void navigate(link({ from }, n) as never)}
            />
          ) : null}
          {!pageSource.waiting && pageSource.requested > size ? (
            <p className="rx-note rx-dim" data-nav="page-size-note">
              {pageSource.off
                ? t`Pages of ${formatInt(pageSource.requested)} need an indexer, which Decentralized only mode doesn't use.`
                : t`Pages of ${formatInt(pageSource.requested)} need an index that is up to date, and none is right now.`}
            </p>
          ) : null}
          {date && range.state === 'loading' ? (
            <p className="rx-note" role="status" data-range-progress={range.found}>
              <progress
                className="rx-progress"
                max={3}
                value={(range.tip.data ? 1 : 0) + range.found}
                aria-label={t`Finding this day's blocks`}
              />{' '}
              {range.tip.data
                ? t`Searching block headers for where this day begins and ends: ${formatInt(range.found)} of 2 found.`
                : t`Reading the chain tip…`}
            </p>
          ) : null}
          <Card layer="core" padding="flush">
            {noBlocks ? (
              <Empty
                kind="none-yet"
                title={t`No blocks on this date`}
                body={t`This network has no blocks in this day, or the day has not happened yet.`}
              />
            ) : shownEmpty ? (
              <Empty
                kind="none-yet"
                title={t`No blocks came back for this page`}
                body={t`The source returned no blocks for heights ${formatInt(window.top - window.count + 1)} to ${formatInt(window.top)}. Try the page either side, or a shorter page.`}
                action={
                  <span
                    className="rx-row"
                    style={{ gap: 8, flexWrap: 'wrap' }}
                    data-nav="empty-page"
                  >
                    {window.newer ? (
                      <Link
                        className="dh-btn"
                        to="/blocks"
                        search={link(window.newer).search as never}
                      >
                        {t`Newer`}
                      </Link>
                    ) : null}
                    {older ? (
                      <Link className="dh-btn" to="/blocks" search={link(older).search as never}>
                        {t`Older`}
                      </Link>
                    ) : null}
                  </span>
                }
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
                pendingRows={early && rows.length > 0 ? size - rows.length : page.pending}
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
              <Link
                to="/blocks"
                search={
                  {
                    from: firstOfDay - 1,
                    ...(pageSource.requested === BLOCKS_PER_PAGE
                      ? {}
                      : { size: pageSource.requested }),
                  } as never
                }
              >
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
