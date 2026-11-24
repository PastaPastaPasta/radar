import { t } from '@lingui/core/macro'
import { Link, useRouter, type LinkProps } from '@tanstack/react-router'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type Cell,
  type ColumnDef,
  type Header,
  type SortingState,
} from '@tanstack/react-table'
import { useWindowVirtualizer, type Virtualizer } from '@tanstack/react-virtual'
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type RefObject,
  useState,
  type ReactNode,
} from 'react'
import type { SourceStamp } from '@/data/envelope'
import { formatInt } from '@/lib/format'
import { announce } from './announce'
import { cx } from './cx'
import { Icon } from './icon'
import { reportsAttr, stampsOfInput, useSectionSource } from './section-source'
import { AmountDensity } from './units-context'
import { Empty, ErrorState, SourceLine } from './states'
import type { LoadState } from './types'
import { barInset, InfiniteSentinel } from './infinite'

export interface DataTableProps<Row> {
  columns: ColumnDef<Row>[]
  rows: Row[]
  getRowId: (r: Row) => string
  state: LoadState
  error?: unknown
  onRetry?: () => void
  empty?: ReactNode
  caption: string
  sort?: { value: string; onChange: (sort: string) => void }
  paging?:
    | { kind: 'page'; page: number; limit: number; total?: number; to: (page: number) => LinkProps }
    | { kind: 'cursor'; next?: LinkProps; prev?: LinkProps }
    | {
        kind: 'infinite'
        hasNext: boolean
        fetchNext: () => void
        fetching: boolean
        /** The last load failed: no more loads start by themselves until the reader asks again. */
        failed?: boolean
      }
  virtual?: boolean
  rowLink?: (r: Row) => LinkProps
  onCellFilter?: (columnId: string, value: string) => void
  /**
   * Live rows: `newRowIds` slide in; `leavingRowIds` fade out before they are dropped; `rise` moves every other row up
   * from that many rows below, after rows above them left.
   */
  live?: { newRowIds: Set<string>; leavingRowIds?: Set<string>; rise?: number }
  /** Placeholder rows after the real ones, for a page whose remaining rows are still on their way. */
  pendingRows?: number
  phone?: 'cards' | 'scroll'
  /** A long list read across many columns: smaller type and tighter cells, so a dozen columns fit the container. */
  dense?: boolean
  source?: SourceStamp | SourceStamp[]
}

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    align?: 'start' | 'end'
    numeric?: boolean
    phone?: 'title' | 'primary' | 'secondary' | 'hidden'
    /** A short unit written after the value on a phone card, where the column header is not shown. */
    phoneUnit?: string
    filterable?: boolean
    width?: string
  }
}

const ROW_HEIGHT = 53
const DENSE_ROW_HEIGHT = 41

const keyTables: symbol[] = []
let lastTouched: symbol | undefined

function isKeyTable(id: symbol): boolean {
  const current = lastTouched && keyTables.includes(lastTouched) ? lastTouched : keyTables[0]
  return current === id
}
const SKELETON_ROWS = 8
const INTERACTIVE = 'a, button, input, select, textarea, label, [role="button"], [role="link"]'

export function parseSort(value: string | undefined): SortingState {
  if (!value) return []
  return value.startsWith('-') ? [{ id: value.slice(1), desc: true }] : [{ id: value, desc: false }]
}

export function stringifySort(id: string, desc: boolean): string {
  return desc ? `-${id}` : id
}

function headerText<Row>(header: Header<Row, unknown>): string {
  const h = header.column.columnDef.header
  if (typeof h === 'string') return h
  const rendered = flexRender(h, header.getContext())
  return typeof rendered === 'string' ? rendered : header.column.id
}

function phoneClass(
  phone: 'title' | 'primary' | 'secondary' | 'hidden' | undefined,
  secondary: number,
): string {
  switch (phone) {
    case 'title':
      return 't'
    case 'primary':
      return 'e'
    case 'hidden':
      return 'h'
    case 'secondary':
      return secondary === 0 ? 'u' : secondary === 1 ? 's' : 'f'
    default:
      return 'f'
  }
}

function CellContent<Row>({
  cell,
  onFilter,
}: {
  cell: Cell<Row, unknown>
  onFilter?: (columnId: string, value: string) => void
}) {
  const content = flexRender(cell.column.columnDef.cell, cell.getContext())
  const value = cell.getValue()
  const filterable = cell.column.columnDef.meta?.filterable === true
  const text = typeof value === 'string' ? value : typeof value === 'number' ? String(value) : ''
  if (onFilter && filterable && text !== '') {
    return (
      <button
        type="button"
        className="rx-cellbtn"
        title={t`Filter by ${text}`}
        onClick={() => {
          onFilter(cell.column.id, text)
        }}
      >
        {content}
      </button>
    )
  }
  return <>{content}</>
}

function InfinitePager({
  paging,
  shown,
  last,
}: {
  paging: Extract<NonNullable<DataTableProps<unknown>['paging']>, { kind: 'infinite' }>
  shown: number
  last?: string | undefined
}) {
  // A load this pager asked for that ends without a single new row is treated as failed, so a broken source is not
  // asked again and again. Refetches it did not start (a poll, a background refresh) never count. A list that keeps
  // only its last pages drops one as it adds one, so a new last row counts as progress too.
  const [asked, setAsked] = useState<{ shown: number; last: string | undefined } | null>(null)
  const [stalled, setStalled] = useState(false)
  const [wasFetching, setWasFetching] = useState(paging.fetching)
  if (paging.fetching !== wasFetching) {
    setWasFetching(paging.fetching)
    if (!paging.fetching && asked !== null) {
      setStalled(shown <= asked.shown && last === asked.last)
      setAsked(null)
    }
  }
  const failed = paging.failed === true || stalled
  const more = () => {
    setAsked({ shown, last })
    setStalled(false)
    paging.fetchNext()
  }
  return (
    <div className="rx-pager" data-infinite>
      <span>{t`${formatInt(shown)} loaded`}</span>
      {failed && paging.hasNext && !paging.fetching ? (
        <button type="button" className="dh-btn dh-btn--sm" onClick={more}>
          {t`Try again`}
        </button>
      ) : (
        <InfiniteSentinel
          onNear={more}
          enabled={paging.hasNext && !paging.fetching && !failed}
          loading={paging.fetching}
          version={`${shown}:${last}`}
          status={
            paging.fetching
              ? t`Loading more…`
              : paging.hasNext
                ? t`${formatInt(shown)} shown. More load as you scroll.`
                : t`All ${formatInt(shown)} shown.`
          }
          fallbackLabel={t`Show more`}
        />
      )}
      <a
        className="rx-go rx-go--up"
        href="#top"
        onClick={(e) => {
          e.preventDefault()
          window.scrollTo({ top: 0 })
        }}
      >
        {t`Back to top`}
      </a>
    </div>
  )
}

export function Pager({
  paging,
  shown,
  last,
}: {
  paging: NonNullable<DataTableProps<unknown>['paging']>
  shown: number
  /** The last row's id, for a list that drops its first pages as it grows. */
  last?: string | undefined
}) {
  if (paging.kind === 'infinite') {
    return <InfinitePager paging={paging} shown={shown} last={last} />
  }
  const link = (props: LinkProps | undefined, label: string, rel: 'next' | 'prev') =>
    props ? (
      <Link {...props} className="dh-btn dh-btn--sm" rel={rel}>
        {label}
      </Link>
    ) : (
      <span className="dh-btn dh-btn--sm" aria-disabled="true">
        {label}
      </span>
    )
  if (paging.kind === 'cursor') {
    return (
      <nav className="rx-pager" aria-label={t`Pagination`}>
        {link(paging.prev, t`Newer`, 'prev')}
        {link(paging.next, t`Older`, 'next')}
      </nav>
    )
  }
  const start = (paging.page - 1) * paging.limit + 1
  const end = start + shown - 1
  const hasNext = paging.total === undefined ? shown >= paging.limit : end < paging.total
  return (
    <nav className="rx-pager" aria-label={t`Pagination`}>
      <span>
        {shown === 0
          ? '0'
          : paging.total === undefined
            ? `${formatInt(start)}–${formatInt(end)}`
            : t`${formatInt(start)}–${formatInt(end)} of ${formatInt(paging.total)}`}
      </span>
      {link(paging.page > 1 ? paging.to(paging.page - 1) : undefined, t`Previous`, 'prev')}
      {link(hasNext ? paging.to(paging.page + 1) : undefined, t`Next`, 'next')}
    </nav>
  )
}

/** Whether the table is wider than the box that holds it, so the box scrolls instead of pushing the page sideways. */
function useWiderThan(
  box: RefObject<HTMLElement | null>,
  table: RefObject<HTMLElement | null>,
): boolean {
  const [wide, setWide] = useState(false)
  useEffect(() => {
    const outer = box.current
    const inner = table.current
    if (!outer || !inner) return
    let frame = 0
    const measure = () => {
      setWide(inner.scrollWidth > outer.clientWidth + 1)
    }
    const later = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    }
    later()
    // The box resizes with the window and the table's width follows its content, so both sizes are watched; rows
    // arriving or leaving are the only structure change that matters.
    const resized = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(later)
    resized?.observe(outer)
    resized?.observe(inner)
    const changed = new MutationObserver(later)
    changed.observe(inner, { childList: true, subtree: true })
    return () => {
      cancelAnimationFrame(frame)
      resized?.disconnect()
      changed.disconnect()
    }
  }, [box, table])
  return wide
}

export function DataTable<Row>({
  columns,
  rows,
  getRowId,
  state,
  error,
  onRetry,
  empty,
  caption,
  sort,
  paging,
  virtual = false,
  rowLink,
  onCellFilter,
  live,
  pendingRows = 0,
  phone = 'cards',
  dense = false,
  source,
}: DataTableProps<Row>) {
  const router = useRouter()
  const tableRef = useRef<HTMLTableElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const wide = useWiderThan(scrollRef, tableRef)
  const bodyId = useId()
  const [tableId] = useState(() => Symbol('table'))
  const [focusId, setFocusId] = useState<string | undefined>(undefined)
  const sorting = parseSort(sort?.value)

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table returns functions that cannot be memoised
  const table = useReactTable({
    data: rows,
    columns,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    enableSortingRemoval: false,
    state: { sorting },
  })
  const modelRows = table.getRowModel().rows
  const headers = table.getHeaderGroups()[0]?.headers ?? []
  const columnCount = headers.length
  const focusIndex = focusId === undefined ? -1 : modelRows.findIndex((r) => r.id === focusId)

  const [scrollMargin, setScrollMargin] = useState(0)
  useLayoutEffect(() => {
    if (virtual && tableRef.current) {
      setScrollMargin(tableRef.current.getBoundingClientRect().top + window.scrollY)
    }
  }, [virtual])

  const drawn = useRef<Virtualizer<Window, Element> | null>(null)
  const average = useRef({ seen: 0, size: 0 })
  const virtualizer = useWindowVirtualizer({
    count: virtual ? modelRows.length : 0,
    // Rows not drawn yet are guessed at the drawn rows' average, so a list of phone cards, several table rows tall
    // each, is about as long before it is drawn as after: a restored offset or a deep link then lands on its row.
    estimateSize: () => {
      const sizes = drawn.current?.itemSizeCache
      if (!sizes || sizes.size === 0) return dense ? DENSE_ROW_HEIGHT : ROW_HEIGHT
      if (sizes.size !== average.current.seen) {
        let sum = 0
        for (const size of sizes.values()) sum += size
        average.current = { seen: sizes.size, size: sum / sizes.size }
      }
      return average.current.size
    },
    overscan: 12,
    scrollMargin,
    initialRect: { width: 1200, height: 900 },
  })
  useLayoutEffect(() => {
    drawn.current = virtualizer
  })
  const virtualItems = virtual ? virtualizer.getVirtualItems() : []
  const visible = virtual
    ? virtualItems.length > 0
      ? virtualItems.map((v) => ({ row: modelRows[v.index], index: v.index }))
      : modelRows.slice(0, 40).map((row, index) => ({ row, index }))
    : modelRows.map((row, index) => ({ row, index }))
  const padTop =
    virtual && virtualItems.length > 0 ? (virtualItems[0]?.start ?? 0) - scrollMargin : 0
  const lastItem = virtualItems[virtualItems.length - 1]
  const padBottom =
    virtual && lastItem ? virtualizer.getTotalSize() - (lastItem.end - scrollMargin) : 0

  const open = useCallback(
    (index: number, newTab: boolean) => {
      const row = modelRows[index]
      if (!row || !rowLink) return
      const link = rowLink(row.original)
      if (newTab) window.open(router.buildLocation(link as never).href, '_blank', 'noopener')
      else void router.navigate(link as never)
    },
    [modelRows, rowLink, router],
  )

  const focusRow = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(modelRows.length - 1, index))
      setFocusId(modelRows[clamped]?.id)
      const el = tableRef.current?.querySelector<HTMLElement>(`[data-index="${clamped}"]`)
      el?.focus({ preventScroll: true })
      el?.scrollIntoView?.({ block: 'nearest' })
    },
    [modelRows],
  )

  const keyed = rowLink !== undefined && state === 'ready'
  useEffect(() => {
    if (!keyed) return
    keyTables.push(tableId)
    return () => {
      keyTables.splice(keyTables.indexOf(tableId), 1)
    }
  }, [keyed, tableId])

  useEffect(() => {
    if (!keyed) return
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || !isKeyTable(tableId)) return
      const t = e.target
      if (
        t instanceof HTMLElement &&
        t.closest('input, textarea, select, [contenteditable="true"]')
      )
        return
      if (e.key === 'j' || e.key === 'k') {
        e.preventDefault()
        focusRow(focusIndex < 0 ? 0 : focusIndex + (e.key === 'j' ? 1 : -1))
      } else if (e.key === 'Enter' && focusIndex >= 0) {
        if (!tableRef.current?.contains(document.activeElement)) return
        if (t instanceof HTMLElement && t.closest(INTERACTIVE)) return
        e.preventDefault()
        open(focusIndex, e.shiftKey)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
    }
  }, [keyed, tableId, focusIndex, focusRow, open])

  const toggleSort = (header: Header<Row, unknown>) => {
    if (!sort) return
    const id = header.column.id
    const current = sorting[0]
    const desc = current?.id === id ? !current.desc : header.column.columnDef.meta?.numeric === true
    sort.onChange(stringifySort(id, desc))
    const column = headerText(header)
    announce(desc ? t`Sorted by ${column}, descending` : t`Sorted by ${column}, ascending`)
  }

  const isReady = state === 'ready' && modelRows.length > 0
  const showEmpty = state === 'empty' || (state === 'ready' && modelRows.length === 0)
  const sortedHeader = headers.find((h) => h.column.id === sorting[0]?.id)

  const head = (
    <thead>
      <tr>
        {headers.map((header) => {
          const meta = header.column.columnDef.meta
          const active = sorting[0]?.id === header.column.id
          const canSort = sort !== undefined && header.column.getCanSort()
          const label = flexRender(header.column.columnDef.header, header.getContext())
          return (
            <th
              key={header.id}
              scope="col"
              className={cx((meta?.align === 'end' || meta?.numeric) && 'r')}
              style={meta?.width ? { width: meta.width } : undefined}
              aria-sort={active ? (sorting[0]?.desc ? 'descending' : 'ascending') : undefined}
            >
              {canSort ? (
                <button
                  type="button"
                  onClick={() => {
                    toggleSort(header)
                  }}
                >
                  {label}
                </button>
              ) : (
                label
              )}
            </th>
          )
        })}
      </tr>
    </thead>
  )

  const skeletonCells = (r: number) =>
    headers.map((h, c) => (
      <td key={h.id}>
        <span className="rx-skel" style={{ width: `${48 + ((r * 7 + c * 13) % 40)}%` }} />
      </td>
    ))

  let body: ReactNode
  if (state === 'loading') {
    body = (
      <tbody aria-hidden="true">
        {Array.from({ length: SKELETON_ROWS }, (_, r) => (
          <tr key={r} className="rx-skelrow">
            {skeletonCells(r)}
          </tr>
        ))}
      </tbody>
    )
  } else if (state === 'error') {
    body = (
      <tbody>
        <tr>
          <td colSpan={columnCount}>
            <ErrorState error={error} onRetry={onRetry} compact />
          </td>
        </tr>
      </tbody>
    )
  } else if (showEmpty) {
    body = (
      <tbody>
        <tr>
          <td colSpan={columnCount}>
            {empty ?? <Empty kind="none-yet" title={t`Nothing to show yet`} />}
          </td>
        </tr>
      </tbody>
    )
  } else {
    let secondary = -1
    const classes = headers.map((h) => {
      const p = h.column.columnDef.meta?.phone
      if (p === 'secondary') secondary++
      return phoneClass(p, secondary)
    })
    body = (
      <tbody id={bodyId}>
        {padTop > 0 ? (
          <tr aria-hidden="true" className="rx-pad">
            <td colSpan={columnCount} style={{ height: padTop }} />
          </tr>
        ) : null}
        {visible.map(({ row, index }) => {
          if (!row) return null
          const id = row.id
          const fresh = live?.newRowIds.has(id) === true
          const leaving = live?.leavingRowIds?.has(id) === true
          const rise = !fresh && !leaving && live?.rise ? live.rise : 0
          return (
            <tr
              key={id}
              ref={virtual ? virtualizer.measureElement : undefined}
              tabIndex={rowLink ? -1 : undefined}
              data-row-id={id}
              data-index={index}
              aria-rowindex={virtual ? index + 2 : undefined}
              className={cx(
                fresh && 'rx-enter',
                leaving && 'rx-leave',
                rise > 0 && 'rx-rise',
                focusId === id && 'is-focus',
              )}
              style={rise > 0 ? ({ '--rx-rise': rise } as CSSProperties) : undefined}
              aria-hidden={leaving || undefined}
              onFocus={() => {
                if (rowLink) setFocusId(id)
              }}
              onClick={
                rowLink
                  ? (e) => {
                      if ((e.target as HTMLElement).closest(INTERACTIVE)) return
                      if (window.getSelection()?.toString()) return
                      open(index, e.metaKey || e.ctrlKey)
                    }
                  : undefined
              }
            >
              {row.getVisibleCells().map((cell, c) => {
                const meta = cell.column.columnDef.meta
                const hint = headers[c]
                const labelled = classes[c] === 'f' && hint ? headerText(hint) : undefined
                return (
                  <td
                    key={cell.id}
                    className={cx(
                      classes[c],
                      (meta?.align === 'end' || meta?.numeric) && 'r',
                      meta?.numeric && 'rx-num',
                    )}
                    data-l={labelled}
                    data-u={meta?.phoneUnit}
                  >
                    <CellContent cell={cell} onFilter={onCellFilter} />
                  </td>
                )
              })}
            </tr>
          )
        })}
        {padBottom > 0 ? (
          <tr aria-hidden="true" className="rx-pad">
            <td colSpan={columnCount} style={{ height: padBottom }} />
          </tr>
        ) : null}
        {Array.from({ length: pendingRows }, (_, r) => (
          <tr key={`pending-${r}`} className="rx-skelrow" aria-hidden="true" data-pending-row>
            {skeletonCells(r)}
          </tr>
        ))}
        {paging?.kind === 'infinite' && paging.fetching ? (
          <tr className="rx-loadmore" aria-hidden="true">
            <td colSpan={columnCount}>
              <span className="rx-skel" style={{ width: '40%' }} />
            </td>
          </tr>
        ) : null}
      </tbody>
    )
  }

  // The live region stays mounted so its first message is read out, and says so once a part-filled page is whole.
  const filling = state === 'ready' && pendingRows > 0 && modelRows.length > 0
  const [wasFilling, setWasFilling] = useState(false)
  if (filling && !wasFilling) setWasFilling(true)
  if (state !== 'ready' && wasFilling) setWasFilling(false)
  const filled = wasFilling && !filling && state === 'ready'

  const all = stampsOfInput(source)
  const inSection = useSectionSource(all, caption)
  const stamps = inSection ? [] : all
  const showFoot = stamps.length > 0 || (paging !== undefined && isReady)

  return (
    <AmountDensity value="table">
      <div
        className={cx('rx-tablewrap', phone === 'scroll' && 'rx-tablewrap--scroll')}
        data-reports={inSection ? reportsAttr(all) : undefined}
        onFocusCapture={() => {
          lastTouched = tableId
        }}
        onPointerEnter={() => {
          lastTouched = tableId
        }}
      >
        <div
          ref={scrollRef}
          className="rx-tablescroll"
          data-wide={wide || undefined}
          {...(wide ? { role: 'region', 'aria-label': caption, tabIndex: 0 } : {})}
        >
          <table
            ref={tableRef}
            className={cx(
              'rx-table',
              phone === 'cards' ? 'rx-table--cards' : 'rx-table--scrolls',
              dense && 'rx-table--dense',
              rowLink && 'rx-table--link',
              rowLink && 'rx-table--nav',
            )}
            aria-busy={state === 'loading' || (state === 'ready' && pendingRows > 0) || undefined}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget)) setFocusId(undefined)
            }}
            aria-rowcount={virtual ? modelRows.length + 1 : undefined}
          >
            <caption className="dh-sr">
              {caption}
              {sortedHeader ? `, ${t`sorted by ${headerText(sortedHeader)}`}` : ''}
            </caption>
            {head}
            {body}
          </table>
        </div>
        {rowLink && isReady ? (
          <span className="rx-tkeys" aria-hidden="true">
            <kbd>j</kbd>
            <kbd>k</kbd> {t`move`} <kbd>↵</kbd> {t`open`}
          </span>
        ) : null}
      </div>
      <p
        className={cx('rx-note rx-dim', !filling && 'dh-sr')}
        aria-live="polite"
        data-pending-note={filling || undefined}
        data-filled-note={filled || undefined}
      >
        {filling
          ? t`Showing ${formatInt(modelRows.length)} of ${formatInt(modelRows.length + pendingRows)} rows. The rest are on their way…`
          : filled
            ? t`All ${formatInt(modelRows.length)} rows shown.`
            : null}
      </p>
      {showFoot ? (
        <div className="rx-tfoot">
          {stamps.length > 0 ? <SourceLine stamp={stamps} compact /> : null}
          {paging && isReady ? (
            <Pager paging={paging} shown={modelRows.length} last={modelRows.at(-1)?.id} />
          ) : null}
        </div>
      ) : null}
    </AmountDensity>
  )
}

export function NewRowsPill({
  count,
  noun,
  onShow,
}: {
  count: number
  noun: string
  onShow: () => void
}) {
  if (count <= 0) return null
  return (
    <button type="button" className="rx-newrows" onClick={onShow}>
      <Icon name="up" size="sm" />
      {t`${formatInt(count)} new ${noun} · show`}
    </button>
  )
}

type InfinitePaging = Extract<NonNullable<DataTableProps<unknown>['paging']>, { kind: 'infinite' }>

interface Reveal {
  /** How many of the list's rows are on the page: always its first ones. */
  count: number
  /** A `DataTable`'s infinite paging over the list, absent while the whole list fits in one step. */
  paging: InfinitePaging | undefined
}

/**
 * Infinite scroll over rows already in memory: `step` more each time the reader nears the end. It opens with `steps`
 * shown (the page a URL names) and starts over at that when `reset` changes, so pass the reader's choices (sort,
 * filter), not the data. While the rows last revealed still load something of their own (`busy`), the next step waits
 * for them, so a list that reads per row asks one step at a time.
 */
export function useReveal({
  total,
  step,
  steps = 1,
  reset,
  busy = false,
}: {
  total: number
  step: number
  steps?: number
  reset?: string | number | undefined
  busy?: boolean
}): Reveal {
  const opening = Math.max(1, steps)
  const fresh = { steps: opening, opened: opening, reset, wanted: false }
  const [state, setState] = useState(fresh)
  let current = state
  if (state.reset !== reset) {
    current = fresh
    setState(current)
  }
  // The step lands a frame after it is asked for, so the pager sees a load start and end and asks again by itself
  // when the end of the list is still near.
  useEffect(() => {
    if (!state.wanted || busy) return
    const frame = requestAnimationFrame(() => {
      setState((s) => ({ ...s, steps: s.steps + 1, wanted: false }))
    })
    return () => {
      cancelAnimationFrame(frame)
    }
  }, [state.wanted, busy])
  const count = Math.min(total, current.steps * step)
  return {
    count,
    paging:
      total > step
        ? {
            kind: 'infinite',
            hasNext: count < total,
            // The rows a list opens with are not a load the reader asked for: counting them would read as a load that
            // brought nothing.
            fetching: current.wanted || (busy && current.steps > current.opened),
            fetchNext: () => {
              setState((s) => (s.wanted ? s : { ...s, wanted: true }))
            },
          }
        : undefined,
  }
}

const indexOf = (el: Element) => Number((el as HTMLElement).dataset.index)
/** The step, from 1, that row `index` of the list is revealed in. */
const stepOf = (index: number, step: number) => Math.floor(index / step) + 1

/** The position in the whole list of the first row below the sticky bar. */
function firstInView(container: HTMLElement, inset: number): number | undefined {
  const row = [...container.querySelectorAll<HTMLElement>('[data-index]')].find(
    (r) => r.getBoundingClientRect().bottom > inset,
  )
  return row ? indexOf(row) : undefined
}

/** `search` with `name` set to `value`, or dropped for undefined; the other parameters keep their own encoding. */
function withParam(search: string, name: string, value: string | undefined): string {
  const kept = search
    .replace(/^\?/, '')
    .split('&')
    .filter((p) => p !== '' && p.split('=')[0] !== name)
  if (value !== undefined) kept.push(`${name}=${value}`)
  return kept.length > 0 ? `?${kept.join('&')}` : ''
}

/**
 * How far to scroll to bring row `index` of the list to the top of the view. A virtualised list may not have drawn it
 * yet: then the scroll goes as far as the drawn rows reach towards it, never past it, since the rows not drawn are only
 * estimated and a jump by a guess can overshoot to the end of the list.
 */
function distanceTo(container: HTMLElement, index: number, inset: number): number | null {
  const row = container.querySelector<HTMLElement>(`[data-index="${index}"]`)
  if (row) {
    const head = row.closest('table')?.querySelector('thead')
    return row.getBoundingClientRect().top - inset - (head?.offsetHeight ?? 0)
  }
  const drawn = [...container.querySelectorAll<HTMLElement>('[data-index]')]
  const before = drawn.filter((el) => indexOf(el) < index).at(-1)
  if (before) return before.getBoundingClientRect().bottom - inset
  const after = drawn[0]
  return after ? after.getBoundingClientRect().top - inset - window.innerHeight : null
}

/** How many frames the list is held at the step it opened on while a virtualised list measures its rows. */
const MAX_FRAMES = 120
/** Frames the row must stay put for before the list is left to the reader. */
const STABLE_FRAMES = 12
const INPUT_EVENTS = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const

/**
 * Keeps a revealed list's place in the address. Opened at step `at` (the URL's `param`, from 1), the page scrolls that
 * step's first row to the top once it is on the page, unless a return to this entry already put the reader in that
 * step. As the reader scrolls, the step of the first row in view is written back with the browser's own
 * `replaceState`, keeping `history.state`, so a reload or a shared link opens there. The router's patched one would
 * start a load and its scroll restoration on every step, so it is gone around: the router reads the new address on the
 * next navigation. Rows are found by `data-index`, their position in the whole list. A list that puts its own scroll
 * back on a return (`restores`) is left alone when the history entry is one this hook wrote.
 */
export function useListPosition(
  container: RefObject<HTMLElement | null>,
  {
    at,
    step,
    count,
    total,
    param = 'page',
    restores = false,
  }: {
    at: number
    step: number
    count: number
    /** The whole list's length: a step past its end is not waited for. */
    total: number
    param?: string
    restores?: boolean
  },
): void {
  const [returning] = useState(
    () => (history.state as { radarListPage?: number } | null)?.radarListPage === at,
  )
  const router = useRouter()
  const placed = useRef(at <= 1 || (restores && returning))
  const target = (at - 1) * step
  const present = count > target
  useEffect(() => {
    if (placed.current) return
    if (total > 0 && target >= total) {
      placed.current = true
      return
    }
    if (!present) return
    let frame = 0
    let frames = 0
    let still = 0
    const release = () => {
      cancelAnimationFrame(frame)
      for (const type of INPUT_EVENTS) window.removeEventListener(type, finish)
    }
    const finish = () => {
      release()
      placed.current = true
    }
    const move = () => {
      const el = container.current
      const inset = barInset()
      if (el && returning && frames === 0) {
        const first = firstInView(el, inset)
        if (first !== undefined && stepOf(first, step) === at) return finish()
      }
      const by = el ? distanceTo(el, target, inset) : null
      if (by === null || frames++ >= MAX_FRAMES) return finish()
      // Rows above it are measured as they are drawn, which moves it again, so it is held until it stays put.
      if (Math.abs(by) < 2 && el?.querySelector(`[data-index="${target}"]`)) {
        if (++still >= STABLE_FRAMES) return finish()
      } else {
        still = 0
        window.scrollBy(0, by)
      }
      frame = requestAnimationFrame(move)
    }
    for (const type of INPUT_EVENTS) window.addEventListener(type, finish, { passive: true })
    frame = requestAnimationFrame(move)
    return release
  }, [container, present, target, total, returning, step, at])
  useEffect(() => {
    let frame = 0
    let written = at
    const path = window.location.pathname
    const write = () => {
      const el = container.current
      // While a navigation away is on its way the address is already the next page's.
      if (!el || !placed.current || router.state.status !== 'idle') return
      if (window.location.pathname !== path) return
      const first = firstInView(el, barInset())
      if (first === undefined) return
      const page = stepOf(first, step)
      if (!Number.isFinite(page) || page === written) return
      written = page
      const { pathname, search, hash } = window.location
      const url = `${pathname}${withParam(search, param, page > 1 ? String(page) : undefined)}${hash}`
      const state = (history.state as Record<string, unknown> | null) ?? {}
      History.prototype.replaceState.call(history, { ...state, radarListPage: page }, '', url)
    }
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(write)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
    }
  }, [container, at, step, param, router])
}
