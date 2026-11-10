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
import { useWindowVirtualizer } from '@tanstack/react-virtual'
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { SourceStamp } from '@/data/envelope'
import { formatInt } from '@/lib/format'
import { announce } from './announce'
import { cx } from './cx'
import { Icon } from './icon'
import { AmountDensity } from './units-context'
import { Empty, ErrorState, SourceLine } from './states'
import type { LoadState } from './types'

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
    | { kind: 'infinite'; hasNext: boolean; fetchNext: () => void; fetching: boolean }
  virtual?: boolean
  rowLink?: (r: Row) => LinkProps
  onCellFilter?: (columnId: string, value: string) => void
  live?: { newRowIds: Set<string> }
  phone?: 'cards' | 'scroll'
  source?: SourceStamp | SourceStamp[]
}

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    align?: 'start' | 'end'
    numeric?: boolean
    phone?: 'title' | 'primary' | 'secondary' | 'hidden'
    filterable?: boolean
    width?: string
  }
}

const ROW_HEIGHT = 53

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
        title={`Filter by ${text}`}
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

function Pager({
  paging,
  shown,
}: {
  paging: NonNullable<DataTableProps<unknown>['paging']>
  shown: number
}) {
  if (paging.kind === 'infinite') {
    return (
      <div className="rx-pager">
        <span>{formatInt(shown)} loaded</span>
        {paging.hasNext ? (
          <button
            type="button"
            className="dh-btn dh-btn--sm"
            disabled={paging.fetching}
            onClick={paging.fetchNext}
          >
            Show more
          </button>
        ) : null}
        <a
          className="rx-go rx-go--up"
          href="#top"
          onClick={(e) => {
            e.preventDefault()
            window.scrollTo({ top: 0 })
          }}
        >
          Back to top
        </a>
      </div>
    )
  }
  const link = (props: LinkProps | undefined, label: string) =>
    props ? (
      <Link
        {...props}
        className="dh-btn dh-btn--sm"
        rel={label === 'Next' || label === 'Older' ? 'next' : 'prev'}
      >
        {label}
      </Link>
    ) : (
      <span className="dh-btn dh-btn--sm" aria-disabled="true">
        {label}
      </span>
    )
  if (paging.kind === 'cursor') {
    return (
      <nav className="rx-pager" aria-label="Pagination">
        {link(paging.prev, 'Newer')}
        {link(paging.next, 'Older')}
      </nav>
    )
  }
  const start = (paging.page - 1) * paging.limit + 1
  const end = start + shown - 1
  const hasNext = paging.total === undefined ? shown >= paging.limit : end < paging.total
  return (
    <nav className="rx-pager" aria-label="Pagination">
      <span>
        {shown === 0 ? '0' : `${formatInt(start)}–${formatInt(end)}`}
        {paging.total === undefined ? '' : ` of ${formatInt(paging.total)}`}
      </span>
      {link(paging.page > 1 ? paging.to(paging.page - 1) : undefined, 'Previous')}
      {link(hasNext ? paging.to(paging.page + 1) : undefined, 'Next')}
    </nav>
  )
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
  phone = 'cards',
  source,
}: DataTableProps<Row>) {
  const router = useRouter()
  const tableRef = useRef<HTMLTableElement>(null)
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

  const virtualizer = useWindowVirtualizer({
    count: virtual ? modelRows.length : 0,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
    scrollMargin,
    initialRect: { width: 1200, height: 900 },
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
    announce(`Sorted by ${headerText(header)}, ${desc ? 'descending' : 'ascending'}`)
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

  let body: ReactNode
  if (state === 'loading') {
    body = (
      <tbody aria-hidden="true">
        {Array.from({ length: SKELETON_ROWS }, (_, r) => (
          <tr key={r} className="rx-skelrow">
            {headers.map((h, c) => (
              <td key={h.id}>
                <span className="rx-skel" style={{ width: `${48 + ((r * 7 + c * 13) % 40)}%` }} />
              </td>
            ))}
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
            {empty ?? <Empty kind="none-yet" title="Nothing to show yet" />}
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
          return (
            <tr
              key={id}
              ref={virtual ? virtualizer.measureElement : undefined}
              tabIndex={rowLink ? -1 : undefined}
              data-row-id={id}
              data-index={index}
              aria-rowindex={virtual ? index + 2 : undefined}
              className={cx(fresh && 'rx-enter', focusId === id && 'is-focus')}
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

  const stamps = source === undefined ? [] : Array.isArray(source) ? source : [source]
  const showFoot = stamps.length > 0 || paging !== undefined || (rowLink !== undefined && isReady)

  return (
    <AmountDensity value="table">
      <div
        className={cx('rx-tablewrap', phone === 'scroll' && 'rx-tablewrap--scroll')}
        onFocusCapture={() => {
          lastTouched = tableId
        }}
        onPointerEnter={() => {
          lastTouched = tableId
        }}
      >
        <div className="rx-tablescroll">
          <table
            ref={tableRef}
            className={cx(
              'rx-table',
              phone === 'cards' ? 'rx-table--cards' : 'rx-table--scrolls',
              rowLink && 'rx-table--link',
              rowLink && 'rx-table--nav',
            )}
            aria-busy={state === 'loading' || undefined}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget)) setFocusId(undefined)
            }}
            aria-rowcount={virtual ? modelRows.length + 1 : undefined}
          >
            <caption className="dh-sr">
              {caption}
              {sortedHeader ? `, sorted by ${headerText(sortedHeader)}` : ''}
            </caption>
            {head}
            {body}
          </table>
        </div>
      </div>
      {showFoot ? (
        <div className="rx-tfoot">
          {rowLink && isReady ? (
            <span className="rx-keys rx-hide-sm">
              <kbd>j</kbd>
              <kbd>k</kbd> move <kbd>↵</kbd> open
            </span>
          ) : null}
          {stamps.length > 0 ? <SourceLine stamp={stamps} compact /> : null}
          {paging && isReady ? <Pager paging={paging} shown={modelRows.length} /> : null}
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
      {formatInt(count)} new {noun} · show
    </button>
  )
}
