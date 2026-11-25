import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useRouter } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { coreQueries, LATEST_BLOCK_ROWS } from '@/data/core/queries'
import { earlyAnswers } from '@/data/early'
import type { BlockRow } from '@/data/core/types'
import { stampOf, type SourceStamp } from '@/data/envelope'
import { insQueries } from '@/data/insight/queries'
import { useIndexHealth } from '@/data/index-health'
import { useHyphenFit } from '@/data/hyphen/fit'
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
import {
  InfiniteSentinel,
  barInset,
  firstVisibleRow,
  replaceUrlQuietly,
  scrollQuietly,
  useOwnScrollAnchoring,
  useScrollAnchor,
  useScrolledUp,
  useTopInView,
} from '@/ui/infinite'
import { CoreBand, RecordHeader, Section } from '../block/frame'
import { BlocksClaim } from '../claims'
import { useAskAgainOnceCurrent } from '../indexed-first'
import {
  BLOCKS_PER_PAGE,
  DAY_MS,
  FIRST_CHUNK,
  MAX_RENDERED_PAGES,
  PAGE_SIZES,
  chunksOf,
  dayStartMs,
  isPageSize,
  newestPage,
  shiftDay,
  todayUtc,
  windowOf,
  type Window,
} from './blocks-range'
import { type RowSource, type ScrollPage, useScrollPages, withBestLock } from './scroll-pages'

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
  const rows = useMemo(() => withBestLock(page.data?.rows ?? [], best), [page.data, best])
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

/**
 * Indexed first (§4.7): the latest page from Hyphen's list, in one request and without waiting for DAPI's tip, shown
 * as "checking with DAPI" until DAPI's rows have all landed, and only while the probe finds Hyphen's index current.
 * Once DAPI's rows have settled on a network they own the page for the rest of the mount: a new block starts a new
 * DAPI read, and Hyphen's older rows must not come back while it runs. Undefined when it is not shown.
 */
function useIndexedLatestRows(
  latest: boolean,
  dapi: PageRows,
  broken: boolean,
): PageRows | undefined {
  const net = useNetwork()
  const fit = useHyphenFit(net)
  const [dapiOwns, setDapiOwns] = useState<ReadonlySet<string>>(() => new Set())
  if (latest && dapi.settled && !dapiOwns.has(net)) setDapiOwns(new Set(dapiOwns).add(net))
  const on =
    latest && earlyAnswers() && !dapiOwns.has(net) && !dapi.settled && !dapi.failed && !broken
  const query = useQuery({
    ...coreQueries.indexedLatestRows(net, LATEST_BLOCK_ROWS),
    enabled: on,
  })
  useAskAgainOnceCurrent(on, fit, query.data, query.refetch)
  const data = query.data
  if (!on || !fit || !data || data.data.length === 0) return undefined
  return {
    rows: data.data,
    settled: false,
    pending: 0,
    stamp: stampOf(data),
    error: null,
    failed: false,
    refetch: () => void query.refetch(),
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
      // Only blocks above the newest one already seen are new; older pages loaded by scrolling are not.
      const newest = Math.max(...[...seen].map(Number))
      const added = ids.filter((id) => !seen.has(id) && Number(id) > newest)
      const unseen = ids.filter((id) => !seen.has(id))
      if (unseen.length > 0) {
        setSeen(new Set([...seen, ...ids]))
        if (added.length > 0) setFresh(new Set(added))
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
      <span className="rx-dim">{t`Blocks per load`}</span>
      <SegFilter
        label={t`Blocks per load`}
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

/**
 * The URL follows the reader: `from` names the first block in view, written with `replaceState` (no navigation, so the
 * list keeps its place), so a reload or Back opens at the same block. Returning to a URL this list wrote, the page
 * scrolls that block back to the top of the view once it has loaded.
 */
function useScrollPosition(
  list: RefObject<HTMLElement | null>,
  {
    from,
    ceiling,
    rows,
    ready,
    settled,
  }: { from?: number; ceiling: number; rows: BlockRow[]; ready: boolean; settled: boolean },
) {
  const [returning] = useState(
    () =>
      from !== undefined &&
      (history.state as { radarBlocksRow?: number } | null)?.radarBlocksRow === from,
  )
  const restored = useRef(!returning)
  const hasRow = from !== undefined && rows.some((r) => r.height === from)
  useEffect(() => {
    if (restored.current || !list.current || !(hasRow || (ready && settled))) return
    const row = list.current.querySelector<HTMLElement>(`[data-row-id="${from}"]`)
    if (row) scrollQuietly(row.getBoundingClientRect().top - barInset())
    restored.current = true
  }, [hasRow, ready, settled, from, list])
  const latest = useRef({ ceiling, ready })
  useEffect(() => {
    latest.current = { ceiling, ready }
  })
  const router = useRouter()
  const rewrite = useRef<(() => void) | undefined>(undefined)
  useEffect(() => {
    let frame = 0
    // The address bar, not the router's copy: a list started over by a link to the router's last address finds the
    // `from` an earlier list wrote there, and clears it.
    let written = currentFrom()
    // Once the router starts another navigation its URL is not this list's to write, until that one settles.
    let leaving = false
    const write = () => {
      const el = list.current
      const now = latest.current
      if (
        leaving ||
        !el ||
        !now.ready ||
        !restored.current ||
        window.location.pathname !== '/blocks'
      )
        return
      const first = firstVisibleRow(el, barInset())
      const height = first ? Number(first.id) : undefined
      if (height === undefined || !Number.isFinite(height)) return
      // The tip itself is the page without `from`; once newer blocks arrive, the same row needs its height.
      const value = height >= now.ceiling ? undefined : height
      if (value === written) return
      const url = new URL(window.location.href)
      if (value === undefined) url.searchParams.delete('from')
      else url.searchParams.set('from', String(value))
      written = value
      const state = (history.state as Record<string, unknown> | null) ?? {}
      replaceUrlQuietly(url, { ...state, radarBlocksRow: height })
    }
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(write)
    }
    rewrite.current = onScroll
    window.addEventListener('scroll', onScroll, { passive: true })
    const stopOnLeave = router.subscribe('onBeforeNavigate', () => {
      leaving = true
      cancelAnimationFrame(frame)
    })
    // A navigation that kept this list may have written the router's older search over the place: note it again.
    const resumeOnSettle = router.subscribe('onResolved', () => {
      leaving = false
      written = currentFrom()
      onScroll()
    })
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      stopOnLeave()
      resumeOnSettle()
    }
  }, [list, router])
  // The row at the top can change without a scroll: a new tip lands there, or the list is first ready. A row that was
  // the tip then needs its own height, and the tip itself none.
  const firstRow = rows[0]?.height
  useEffect(() => rewrite.current?.(), [ceiling, firstRow, ready])
}

/** The `from` the URL holds now: the list writes it as the reader scrolls, so the router's copy may be older. */
function currentFrom(): number | undefined {
  const value = new URL(window.location.href).searchParams.get('from')
  return value === null || value === '' ? undefined : Number(value)
}

/** The lowest height among a page's rows. */
const lowestOf = (rows: BlockRow[]) =>
  rows.length > 0 ? Math.min(...rows.map((r) => r.height)) : undefined

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
  const net = useNetwork()
  const range = useRange(date)
  const pageSource = usePageSource(requestedSize)
  const size = pageSource.size
  // While the day's first block is still being searched for, its newest rows are read already: the same read the
  // finished page starts with, so nothing is asked twice.
  const early =
    range.provisional && from === undefined && pageSource.source === 'dapi' && range.ceiling >= 0
  // A page that names its newest height reads its first rows before the tip lands; the tip only bounds the pager.
  const named =
    !date &&
    from !== undefined &&
    range.state === 'loading' &&
    pageSource.source === 'dapi' &&
    !pageSource.waiting
  // The list is anchored where it opened (the height the URL names, or the tip once known), so page 0 stays put while
  // new blocks arrive above it and older ones load below.
  const [anchor, setAnchor] = useState(from)
  if (anchor === undefined && range.state === 'ready' && !pageSource.waiting) {
    setAnchor(range.ceiling)
  }
  const window: Window | null =
    range.state === 'ready' && !pageSource.waiting
      ? windowOf(range.ceiling, range.floor, anchor ?? from, size)
      : early
        ? {
            top: range.ceiling,
            count: Math.min(FIRST_CHUNK, range.ceiling + 1),
            newer: null,
            older: null,
          }
        : named
          ? { top: from, count: Math.min(FIRST_CHUNK, from + 1), newer: null, older: null }
          : null
  useDocumentTitle(date ? t`Blocks on ${date}` : t`Blocks`)

  const dapiRows = useDapiRows(window, pageSource.source === 'dapi')
  const hyphenRows = useHyphenRows(window, pageSource.source === 'hyphen')
  const insightRows = useInsightRows(window, pageSource.source === 'insight')
  const latest = !date && from === undefined && pageSource.source === 'dapi'
  const indexedRows = useIndexedLatestRows(latest, dapiRows, range.state === 'error')
  const page =
    indexedRows ?? { dapi: dapiRows, hyphen: hyphenRows, insight: insightRows }[pageSource.source]
  const dayStart = date ? dayStartMs(date) : 0
  // Until the day's first block is known, a row is shown only if its own time puts it in the day.
  const rows = useMemo(
    () => (early ? page.rows.filter((r) => r.time >= dayStart) : page.rows),
    [early, page.rows, dayStart],
  )
  const ready = range.state === 'ready' && window !== null && !indexedRows
  const tipPage = ready ? newestPage(window.top, range.ceiling, size) : 0
  const [view, setView] = useState({ lo: 0, hi: 0, follow: from === undefined })
  const listRef = useRef<HTMLDivElement>(null)
  // Re-anchoring at the tip reads the newest page afresh instead of filling every page between here and there.
  const reanchor = () => {
    setAnchor(range.ceiling)
    setView({ lo: 0, hi: 0, follow: true })
  }
  const topInView = useTopInView(listRef)
  // While the reader sits at the top of the newest page it follows the tip: a page that fills gives way to the next,
  // and a tip that ran more than a page ahead (a tab back from sleep) starts the list again at the tip. A reader further
  // down keeps their rows; the pill offers the newer blocks instead.
  if (ready && view.follow && view.lo !== tipPage) {
    if (!topInView) {
      setView({ ...view, follow: false })
    } else if (tipPage >= view.lo - 1) {
      setView({
        ...view,
        lo: tipPage,
        hi: Math.max(tipPage, Math.min(view.hi, tipPage + MAX_RENDERED_PAGES - 1)),
      })
    } else {
      reanchor()
    }
  }
  const pages = useScrollPages({
    net,
    source: pageSource.source,
    base: ready
      ? { top: window.top, count: window.count, rows: page.rows, settled: page.settled }
      : null,
    ceiling: range.ceiling,
    floor: range.floor,
    size,
    lo: view.lo,
    hi: view.hi,
  })
  const above = pages.filter((p) => p.k < 0 && p.k >= view.lo).sort((a, b) => a.k - b.k)
  const below = pages.filter((p) => p.k > 0 && p.k <= view.hi).sort((a, b) => a.k - b.k)
  const showsBase = view.lo <= 0 && view.hi >= 0
  const shownRows = [
    ...above.flatMap((p) => p.rows),
    ...(showsBase ? rows : []),
    ...below.flatMap((p) => p.rows),
  ]
  const basePage = {
    k: 0,
    settled: page.settled,
    failed: page.failed,
    rows: page.rows,
    refetch: page.refetch,
  }
  const topPage = above[0] ?? (showsBase ? basePage : below[0])
  const bottomPage = below.at(-1) ?? (showsBase ? basePage : above.at(-1))
  const insight = pageSource.source === 'insight'
  const lastBottom =
    !ready || !bottomPage
      ? undefined
      : insight
        ? bottomPage.settled
          ? lowestOf(bottomPage.rows)
          : undefined
        : bottomPage.k !== 0
          ? (bottomPage as ScrollPage).span.top - (bottomPage as ScrollPage).span.count + 1
          : window.top - window.count + 1
  const moreBelow = lastBottom !== undefined && lastBottom > range.floor
  const moreAbove = ready && view.lo > tipPage
  const atTip = ready && view.lo === tipPage
  const scrolledUp = useScrolledUp()
  const extend = (edge: 'start' | 'end') => {
    if (edge === 'end') {
      const hi = view.hi + 1
      const lo = Math.max(view.lo, hi - MAX_RENDERED_PAGES + 1)
      setView({ lo, hi, follow: view.follow && lo === view.lo })
    } else {
      const lo = view.lo - 1
      setView({ lo, hi: Math.min(view.hi, lo + MAX_RENDERED_PAGES - 1), follow: lo === tipPage })
    }
  }
  const resetAnchor = useScrollAnchor(
    listRef,
    `${shownRows[0]?.height ?? ''}:${shownRows.length}`,
    view.follow,
  )
  // The newest blocks are a fresh start at the tip: the view moves to the top of the list, then the page opens anew.
  const jumpToNewest = () => {
    resetAnchor()
    const top = listRef.current?.getBoundingClientRect().top
    if (top !== undefined) scrollQuietly(top - barInset())
    void navigate(link({}) as never)
  }
  useOwnScrollAnchoring()
  useScrollPosition(listRef, {
    from,
    ceiling: range.ceiling,
    rows: shownRows,
    ready,
    settled: page.settled,
  })
  const today = todayUtc()
  const fresh = useFreshRows(shownRows, atTip && (!date || date === today))
  const hasPool = shownRows.some((r) => r.pool)

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
  const shownEmpty = window !== null && !early && !named && page.settled && shownRows.length === 0
  // A named page read before the tip may name a height above it; that read's failure is not the page's.
  const state =
    range.state === 'error' || (page.failed && !named)
      ? 'error'
      : shownRows.length > 0 || noBlocks
        ? 'ready'
        : 'loading'
  const dateLabel = date ? formatDate(dayStartMs(date), { utc: true, time: false }) : undefined
  const tipTime = range.tip.data?.data.time ?? (indexedRows ? rows[0]?.time : undefined)
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
  const heights = shownRows.map((r) => r.height)
  const lowest = heights.length > 0 ? Math.min(...heights) : undefined
  const firstOfDay = date && range.state === 'ready' ? range.floor : undefined
  const reachedFloor = ready && !moreBelow && bottomPage?.settled === true
  const loadingAbove = moreAbove && topPage !== undefined && !topPage.settled && !topPage.failed
  const loadingBelow =
    bottomPage !== undefined && bottomPage.k !== 0 && !bottomPage.settled && !bottomPage.failed
  const newerCount =
    moreAbove && shownRows[0] ? Math.max(0, range.ceiling - shownRows[0].height) : 0

  return (
    <article data-page="/blocks" data-layer="core">
      <CoreBand crumbs={[{ label: t`Core` }, { label: t`Blocks` }]}>
        <RecordHeader
          icon="block"
          kicker={t`Core`}
          title={
            dateLabel ? (
              t`Blocks on ${dateLabel}`
            ) : tipTime === undefined ? (
              t`Blocks`
            ) : (
              <BlocksClaim minedAt={tipTime} />
            )
          }
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
            lowest !== undefined && page.pending === 0 && !early && !named
              ? t`Heights ${formatInt(lowest)} to ${formatInt(Math.max(...heights))}`
              : undefined
          }
          source={stamp}
        >
          {pageSource.offered ? (
            <PageSizeControl
              size={pageSource.waiting ? pageSource.requested : size}
              available={pageSource.longPageAvailable}
              link={(n) => void navigate(link({ from: currentFrom() }, n) as never)}
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
          {moreAbove ? (
            <div className="rx-jump" data-nav="newest">
              <button type="button" className="rx-newrows" onClick={jumpToNewest}>
                {newerCount > 0
                  ? t`${formatInt(newerCount)} newer blocks · jump to the newest`
                  : t`Jump to the newest blocks`}
              </button>
            </div>
          ) : null}
          <div ref={listRef} className="rx-scrolllist" tabIndex={-1}>
            {topPage?.failed && topPage.k < 0 ? (
              <p className="rx-note" role="status" data-nav="newer-failed">
                {t`The newer blocks could not be loaded.`}{' '}
                <button
                  type="button"
                  className="dh-btn dh-btn--sm"
                  onClick={() => {
                    topPage.refetch()
                  }}
                >
                  {t`Try again`}
                </button>
              </p>
            ) : moreAbove ? (
              <InfiniteSentinel
                edge="start"
                onNear={() => {
                  extend('start')
                }}
                enabled={topPage?.settled === true}
                auto={scrolledUp}
                loading={loadingAbove}
                version={shownRows.length}
                status={loadingAbove ? t`Loading newer blocks…` : ''}
                fallbackLabel={t`Show newer blocks`}
              />
            ) : null}
            <Card layer="core">
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
                        <Link className="dh-btn" to="/blocks" search={link({}).search as never}>
                          {t`Newest blocks`}
                        </Link>
                      ) : null}
                    </span>
                  }
                />
              ) : (
                <DataTable
                  caption={dateLabel ? t`Blocks on ${dateLabel}` : t`Core blocks`}
                  columns={columns}
                  rows={shownRows}
                  getRowId={(r) => String(r.height)}
                  state={state}
                  error={range.error ?? page.error}
                  onRetry={page.refetch}
                  pendingRows={
                    (early || named) && rows.length > 0
                      ? (named ? Math.min(size, (from ?? 0) + 1) : size) - rows.length
                      : page.pending
                  }
                  rowLink={(r) => ({ to: '/block/$id', params: { id: String(r.height) } })}
                  live={{ newRowIds: fresh }}
                />
              )}
            </Card>
            {ready && (moreBelow || loadingBelow || bottomPage?.failed === true) ? (
              bottomPage?.failed ? (
                <p className="rx-note" role="status" data-nav="older-failed">
                  {t`The older blocks could not be loaded.`}{' '}
                  <button
                    type="button"
                    className="dh-btn dh-btn--sm"
                    onClick={() => {
                      bottomPage.refetch()
                    }}
                  >
                    {t`Try again`}
                  </button>
                </p>
              ) : (
                <InfiniteSentinel
                  onNear={() => {
                    extend('end')
                  }}
                  enabled={moreBelow && bottomPage?.settled === true}
                  loading={loadingBelow}
                  version={shownRows.length}
                  status={
                    loadingBelow ? t`Loading older blocks…` : t`Older blocks load as you scroll.`
                  }
                  fallbackLabel={t`Show older blocks`}
                />
              )
            ) : null}
          </div>
          {firstOfDay !== undefined && firstOfDay > 0 && reachedFloor ? (
            <p className="rx-note" data-nav="older-than-day">
              {t`That is the first block on ${dateLabel ?? date}. Going older leaves this day.`}{' '}
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
          <p className="rx-note rx-dim">{t`Newest first; ${formatInt(size)} more load at a time as you scroll.`}</p>
        </Section>
      </div>
    </article>
  )
}
