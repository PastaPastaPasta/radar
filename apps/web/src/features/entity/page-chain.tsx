import { useLingui } from '@lingui/react/macro'
import {
  useQueries,
  useQuery,
  type QueryKey,
  type UseQueryOptions,
  type UseQueryResult,
} from '@tanstack/react-query'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { stampOf, type Sourced, type SourceStamp } from '@/data/envelope'
import type { LoadState } from '@/ui'
import { InfiniteSentinel, NEAR_MARGIN, firstVisibleRow, observerAvailable } from '@/ui/infinite'
import { keepPreviousOnNetwork } from './keep-previous'
import { useNetwork } from './network'

/** Pages a scrolling list keeps on the page; the ones it drops are read again (from the cache) as the reader returns. */
export const MAX_LIST_PAGES = 8

/** The sticky bar's height: rows under it are not in view. */
const BAR_INSET = 64

export interface PageChainOptions<P, Param, Row, K extends QueryKey> {
  /** Everything the list is read with but its network and position: a new value starts it again at `start`. */
  listKey: string
  /** Where the list opens: the page or cursor the address names. */
  start: Param
  /** The cursors of the pages above `start`, first page first, when the address keeps them. */
  earlier?: Param[] | undefined
  query: (param: Param) => UseQueryOptions<P, Error, P, K>
  rows: (page: P) => readonly Row[]
  getRowId: (row: Row) => string
  /** The page after this one, or undefined at the end. */
  next: (page: P, param: Param) => Param | undefined
  /** The page before the list's first, for a list that opened part-way down (page numbers). */
  prev?: (param: Param) => Param | undefined
  /** The first page when it came with something else, so it is not read again. */
  head?: P | undefined
  enabled?: boolean
  maxPages?: number
}

export interface ChainPage<P, Param> {
  param: Param
  data: P | undefined
  pending: boolean
  failed: boolean
  error: unknown
  refetch: () => void
}

export interface PageChain<P, Param, Row> {
  pages: ChainPage<P, Param>[]
  rows: Row[]
  /** The chain's own row ids, which the table's `data-row-id` must match for the place in the address to follow. */
  getRowId: (row: Row) => string
  state: LoadState
  error: unknown
  onRetry: () => void
  /** Reads the next page now, whether or not the reader has scrolled: for a page the view needs. */
  readOn: () => void
  /** DataTable's `paging`: loads the next page as the reader nears the end. */
  paging: {
    kind: 'infinite'
    hasNext: boolean
    fetchNext: () => void
    fetching: boolean
    failed: boolean
  }
  /** Pages above the first one shown: dropped as the list grew, or before the page the address named. */
  before: { has: boolean; load: () => void; loading: boolean; failed: boolean }
  /** Starts the list again from its first page, for a cursor list opened part-way down. */
  restart: (() => void) | undefined
  /** The page each shown row came from, and the pages above it. */
  paramOf: (rowId: string) => { param: Param; earlier: Param[] } | undefined
  /** The list's identity: its network and `listKey`. */
  listId: string
  /** Changes whenever rows are added or dropped. */
  version: string
}

interface Chain<Param> {
  key: string
  /** The place the address named when the chain last followed it. */
  start: string
  params: Param[]
  lo: number
  hi: number
  /** Pages read on in a row because a filter hid every row they held. */
  skipped: number
}

/**
 * Until the reader turns a wheel, drags a finger or presses a key, a sentinel already in view on arrival does not load:
 * a list whose first page is short would otherwise read its second before anyone asked, and a scroll the page makes by
 * itself (restoring a position, jumping to an anchor) is not the reader asking. Where there is no IntersectionObserver
 * the sentinel is a button, so nothing waits.
 */
function useReaderMoved(): boolean {
  const [moved, setMoved] = useState(() => !observerAvailable())
  useEffect(() => {
    if (moved) return
    const events = ['wheel', 'touchmove', 'keydown'] as const
    const on = () => {
      setMoved(true)
    }
    for (const e of events) window.addEventListener(e, on, { passive: true })
    return () => {
      for (const e of events) window.removeEventListener(e, on)
    }
  }, [moved])
  return moved
}

/**
 * `load`, held back until the reader has moved (see `useReaderMoved`): a call before then is made once they do, so a
 * sentinel already in view on arrival still loads as soon as the reader scrolls.
 */
function useOnceReaderMoves(load: () => void): () => void {
  const moved = useReaderMoved()
  const wanted = useRef(false)
  const latest = useRef(load)
  useLayoutEffect(() => {
    latest.current = load
  })
  useEffect(() => {
    if (moved && wanted.current) {
      wanted.current = false
      latest.current()
    }
  }, [moved])
  return () => {
    if (moved) latest.current()
    else wanted.current = true
  }
}

/** Pages in a row a browser-side filter may hide entirely before the list says nothing matched. */
const MAX_SKIPPED_PAGES = 12

const idOf = (param: unknown): string => JSON.stringify(param) ?? ''

/**
 * A list read one page at a time as the reader scrolls, from the page or cursor the address names. Each page is its own
 * cached query, a page is asked for only once the one before it has landed, and at most `maxPages` are kept: past
 * that the first is dropped, and read back from the cache when the reader scrolls up to it again.
 */
export function usePageChain<P, Param, Row, K extends QueryKey>(
  opts: PageChainOptions<P, Param, Row, K>,
): PageChain<P, Param, Row> {
  const { query, rows: rowsOf, getRowId, next, prev, head, enabled = true } = opts
  const max = opts.maxPages ?? MAX_LIST_PAGES
  const net = useNetwork()
  const key = `${net}\u0000${opts.listKey}`
  const start = idOf(opts.start)
  const fresh = (): Chain<Param> => {
    const earlier = opts.earlier ?? []
    return {
      key,
      start,
      params: [...earlier, opts.start],
      lo: earlier.length,
      hi: earlier.length,
      skipped: 0,
    }
  }
  const [stored, setChain] = useState<Chain<Param>>(fresh)
  // The address names another place: the list moves there, unless it holds that page already, as it does when the
  // list wrote the address itself (replaceState reaches the router, so the search changes under it).
  const chain: Chain<Param> =
    stored.key !== key
      ? fresh()
      : stored.start === start
        ? stored
        : stored.params.some((p) => idOf(p) === start)
          ? { ...stored, start }
          : fresh()
  if (stored !== chain) setChain(chain)
  const same = (c: Chain<Param>) =>
    c.key === chain.key &&
    c.lo === chain.lo &&
    c.hi === chain.hi &&
    c.params.length === chain.params.length

  const shown = chain.params.slice(chain.lo, chain.hi + 1)
  const isHead = (i: number) =>
    head !== undefined && prev === undefined && chain.lo + i === 0 && shown[i] === undefined
  // A list that starts again (a filter changed) keeps the last rows on screen until its first page lands. Only a
  // single query hands its last answer on, so the first page is read on its own.
  const firstRead: UseQueryResult<P, Error> = useQuery({
    ...query(shown[0] as Param),
    enabled: enabled && !isHead(0),
    ...(chain.params.length === 1 ? { placeholderData: keepPreviousOnNetwork(net) } : {}),
  })
  const laterReads: UseQueryResult<P, Error>[] = useQueries<UseQueryOptions<P, Error, P, K>[]>({
    queries: shown
      .slice(1)
      .map((param, i) => ({ ...query(param), enabled: enabled && !isHead(i + 1) })),
  })
  const results = [firstRead, ...laterReads]
  const pages: ChainPage<P, Param>[] = shown.map((param, i) => {
    const r = results[i]!
    const data = isHead(i) ? head : r.data
    const failed = data === undefined && r.isError && !r.isFetching
    return {
      param,
      data,
      pending: (data === undefined || (r.isPlaceholderData && !isHead(i))) && !failed,
      failed,
      error: r.error,
      refetch: () => void r.refetch(),
    }
  })

  // Pages of a live list are read at different times, so a row can move onto the next page: it is shown once.
  const rows: Row[] = []
  const owner = new Map<string, number>()
  pages.forEach((page, i) => {
    for (const row of page.data === undefined ? [] : rowsOf(page.data)) {
      const id = getRowId(row)
      if (owner.has(id)) continue
      rows.push(row)
      owner.set(id, chain.lo + i)
    }
  })
  const first = pages[0]
  const last = pages[pages.length - 1]
  const busy = pages.some((p) => p.pending)
  const nextParam =
    chain.hi < chain.params.length - 1
      ? chain.params[chain.hi + 1]
      : last?.data !== undefined && !last.pending
        ? next(last.data, last.param)
        : undefined
  // A cursor list's first page has no cursor, so whether there is a page above is told apart from its cursor.
  const prevParam = chain.lo > 0 || !first || !prev ? undefined : prev(first.param)
  const hasPrev = chain.lo > 0 || prevParam !== undefined
  const failedPage = pages.find((p) => p.failed)

  const advance = (c: Chain<Param>, skipped: number): Chain<Param> => {
    if (nextParam === undefined) return c
    const params = c.hi < c.params.length - 1 ? c.params : [...c.params, nextParam]
    const hi = c.hi + 1
    return { ...c, params, hi, lo: Math.max(c.lo, hi - max + 1), skipped }
  }
  const readOn = () => {
    if (busy || !last) return
    if (last.failed) {
      last.refetch()
      return
    }
    setChain((c) => (same(c) ? advance(c, 0) : c))
  }
  const fetchNext = useOnceReaderMoves(readOn)

  const fetchPrev = () => {
    if (busy || !first) return
    if (first.failed) {
      first.refetch()
      return
    }
    setChain((c) => {
      if (!same(c)) return c
      if (c.lo > 0) {
        const lo = c.lo - 1
        return { ...c, lo, hi: Math.min(c.hi, lo + max - 1) }
      }
      if (prevParam === undefined) return c
      return { ...c, params: [prevParam, ...c.params], lo: 0, hi: Math.min(c.hi + 1, max - 1) }
    })
  }

  // A page whose rows a browser-side filter hides entirely reads on, so the list is not left blank.
  const canReadOn =
    rows.length === 0 &&
    !busy &&
    !failedPage &&
    nextParam !== undefined &&
    chain.skipped < MAX_SKIPPED_PAGES
  if (canReadOn) setChain((c) => (same(c) ? advance(c, c.skipped + 1) : c))

  const state: LoadState = !enabled
    ? 'loading'
    : rows.length > 0
      ? 'ready'
      : busy || canReadOn
        ? 'loading'
        : failedPage
          ? 'error'
          : 'empty'
  // A cursor list opened part-way down knows nothing of the pages above it, so it offers its start instead.
  const restart =
    !hasPrev && prev === undefined && chain.params[chain.lo] !== undefined
      ? () => {
          setChain({ key, start, params: [undefined as Param], lo: 0, hi: 0, skipped: 0 })
        }
      : undefined

  return {
    pages,
    rows,
    getRowId,
    readOn,
    state,
    error: failedPage?.error,
    onRetry: () => {
      for (const p of pages) if (p.failed) p.refetch()
    },
    paging: {
      kind: 'infinite',
      hasNext: last?.failed === true || nextParam !== undefined,
      fetchNext,
      fetching: pages.length > 1 && last?.pending === true,
      failed: last?.failed === true,
    },
    before: {
      has: hasPrev,
      load: fetchPrev,
      loading: pages.length > 1 && first?.pending === true,
      failed: pages.length > 1 && first?.failed === true,
    },
    restart,
    paramOf: (id) => {
      const i = owner.get(id)
      return i === undefined
        ? undefined
        : { param: chain.params[i] as Param, earlier: chain.params.slice(0, i) }
    },
    listId: key,
    version: `${chain.key}:${chain.lo}:${chain.hi}:${rows.length}`,
  }
}

/** Keeps the row at the top of the view where it is when rows are added or dropped above it. */
function useKeepRowInPlace(container: RefObject<HTMLElement | null>, version: string): void {
  const anchor = useRef<{ id: string; top: number } | null>(null)
  useEffect(() => {
    let frame = 0
    const record = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        anchor.current = container.current ? firstVisibleRow(container.current, BAR_INSET) : null
      })
    }
    record()
    window.addEventListener('scroll', record, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', record)
    }
  }, [container])
  useLayoutEffect(() => {
    const el = container.current
    if (!el) return
    const was = anchor.current
    const row = was && el.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(was.id)}"]`)
    if (was && row) {
      const moved = row.getBoundingClientRect().top - was.top
      if (Math.abs(moved) >= 1) window.scrollBy(0, moved)
    }
    // Rows that arrive with no scroll since (the first page, a page loaded below) are what the next change is held to.
    anchor.current = firstVisibleRow(el, BAR_INSET)
  }, [container, version])
}

/**
 * Writes the page or cursor of the first row in view to the address with `replaceState`, keeping the router's history
 * state, so a reload or Back opens the list where the reader was. The router hears it and passes the new place back,
 * which `usePageChain` already holds, so the list keeps its rows.
 */
function useWritePosition<Param>(
  container: RefObject<HTMLElement | null>,
  paramOf: (rowId: string) => { param: Param; earlier: Param[] } | undefined,
  write: ((url: URL, param: Param, earlier: Param[]) => void) | undefined,
): void {
  const latest = useRef({ paramOf, write })
  useLayoutEffect(() => {
    latest.current = { paramOf, write }
  })
  const on = write !== undefined
  useEffect(() => {
    if (!on) return
    let frame = 0
    let written: string | undefined
    const save = () => {
      const el = container.current
      const { paramOf: of, write: put } = latest.current
      if (!el || !put) return
      const row = firstVisibleRow(el, BAR_INSET)
      if (!row) return
      const found = of(row.id)
      if (!found) return
      const url = new URL(window.location.href)
      put(url, found.param, found.earlier)
      if (url.href === window.location.href || url.href === written) return
      written = url.href
      const state = (history.state as Record<string, unknown> | null) ?? {}
      history.replaceState(state, '', url)
    }
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(save)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
    }
  }, [container, on])
}

/**
 * Waits until the reader has scrolled away from the top of a list that opened part-way down, or scrolls up at it: the
 * earlier pages load then, not as soon as the list opens with its first row already in view.
 */
function useArmedAbove(ref: RefObject<HTMLElement | null>, has: boolean, listId: string): boolean {
  const [armedFor, setArmedFor] = useState<string | undefined>(() =>
    observerAvailable() ? undefined : listId,
  )
  const armed = armedFor === listId
  useEffect(() => {
    if (armed || !has) return
    const away = Number.parseInt(NEAR_MARGIN, 10)
    let touchY: number | undefined
    const arm = () => {
      setArmedFor(listId)
    }
    const onScroll = () => {
      const el = ref.current
      if (el && el.getBoundingClientRect().bottom < -away) arm()
    }
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) arm()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp' || e.key === 'PageUp' || e.key === 'Home') arm()
    }
    const onTouchStart = (e: TouchEvent) => {
      touchY = e.touches[0]?.clientY
    }
    const onTouchMove = (e: TouchEvent) => {
      const y = e.touches[0]?.clientY
      if (touchY !== undefined && y !== undefined && y > touchY) arm()
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('wheel', onWheel, { passive: true })
    window.addEventListener('keydown', onKey)
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
    }
  }, [armed, has, ref, listId])
  return armed || !observerAvailable()
}

/**
 * Wraps a list read through `usePageChain`: the pages above the first one shown load as the reader scrolls up to them,
 * the rows in view stay put as pages are added or dropped, and `position` writes where the reader is to the address.
 */
export function ScrollList<Param>({
  chain,
  position,
  children,
}: {
  chain: Pick<
    PageChain<unknown, Param, unknown>,
    'before' | 'restart' | 'paramOf' | 'listId' | 'version'
  >
  /** Puts the page or cursor of the row at the top of the view in the address. */
  position?: (url: URL, param: Param, earlier: Param[]) => void
  children: ReactNode
}) {
  const { t } = useLingui()
  const { before } = chain
  const ref = useRef<HTMLDivElement>(null)
  const top = useRef<HTMLDivElement>(null)
  useKeepRowInPlace(ref, chain.version)
  useWritePosition(ref, chain.paramOf, position)
  const armed = useArmedAbove(top, before.has, chain.listId)
  const { restart } = chain
  return (
    <div ref={ref} className="rx-scrolllist" data-scroll-list>
      {before.failed ? (
        <div className="rx-pager" data-list-start>
          <span>{t`The rows above could not be loaded.`}</span>
          <button type="button" className="dh-btn dh-btn--sm" onClick={before.load}>
            {t`Try again`}
          </button>
        </div>
      ) : before.has ? (
        <div ref={top}>
          <InfiniteSentinel
            edge="start"
            onNear={before.load}
            enabled={armed && !before.loading}
            loading={before.loading}
            status={before.loading ? t`Loading earlier rows…` : ''}
            fallbackLabel={t`Show earlier rows`}
          />
        </div>
      ) : restart ? (
        <div className="rx-pager" data-list-start>
          <button
            type="button"
            className="dh-btn dh-btn--sm"
            onClick={() => {
              restart()
              if (position) {
                const url = new URL(window.location.href)
                position(url, undefined as Param, [])
                history.replaceState(history.state as unknown, '', url)
              }
              ref.current?.scrollIntoView({ block: 'start' })
            }}
          >
            {t`Back to the start of the list`}
          </button>
        </div>
      ) : null}
      {children}
    </div>
  )
}

/** Writes the page in view as `page`, which page 1 leaves out. */
export function pagePosition(url: URL, page: number): void {
  if (page > 1) url.searchParams.set('page', String(page))
  else url.searchParams.delete('page')
}

/** Writes the cursor of the page in view as `name`, which the list's first page leaves out. */
export const cursorPosition =
  (name: string) =>
  (url: URL, cursor: string | number | undefined): void => {
    if (cursor === undefined) url.searchParams.delete(name)
    else url.searchParams.set(name, String(cursor))
  }

/** The source stamps of a chain's pages that have landed. */
export const chainStamps = (
  pages: readonly { data: Sourced<unknown> | undefined }[],
): SourceStamp[] => pages.flatMap((p) => (p.data ? [stampOf(p.data)] : []))
