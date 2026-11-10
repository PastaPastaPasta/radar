import { Link, type LinkProps } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import type { ReactNode } from 'react'
import type { SourceStamp } from '@/data/envelope'
import type { LinkOutTarget } from '@/lib/linkouts'
import { Empty, ErrorState, Skeleton, SourceLine } from './states'
import type { Layer, LoadState } from './types'

export interface TabsProps {
  tabs: { id: string; label: ReactNode; count?: number; disabled?: boolean }[]
  value: string
  to: (id: string) => LinkProps
  layer?: Layer
}

export function Tabs({ tabs, value, to, layer }: TabsProps) {
  return (
    <nav data-layer={layer}>
      <ul>
        {tabs.map((tab) => (
          <li key={tab.id}>
            {tab.disabled ? (
              <span aria-disabled="true">{tab.label}</span>
            ) : (
              <Link {...to(tab.id)} aria-current={tab.id === value ? 'page' : undefined}>
                {tab.label}
                {tab.count === undefined ? null : <span> {tab.count}</span>}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </nav>
  )
}

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

function plain(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint'
    ? String(value)
    : ''
}

function columnId<Row>(col: ColumnDef<Row>): string {
  if (col.id) return col.id
  return 'accessorKey' in col ? plain(col.accessorKey) : ''
}

function cell<Row>(col: ColumnDef<Row>, row: Row, index: number): string {
  if ('accessorFn' in col) return plain(col.accessorFn(row, index))
  if ('accessorKey' in col) return plain((row as Record<string, unknown>)[plain(col.accessorKey)])
  return ''
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
  source,
}: DataTableProps<Row>) {
  if (state === 'loading') return <Skeleton shape="row" count={5} />
  if (state === 'error') return <ErrorState error={error} onRetry={onRetry} />
  if (state === 'empty' || rows.length === 0) {
    return <>{empty ?? <Empty kind="none-yet" title="Nothing to show" />}</>
  }
  return (
    <div>
      <table>
        <caption>{caption}</caption>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={columnId(col)} scope="col">
                {typeof col.header === 'string' ? col.header : columnId(col)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={getRowId(row)} data-row-id={getRowId(row)}>
              {columns.map((col) => (
                <td key={columnId(col)}>{cell(col, row, i)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {source ? <SourceLine stamp={source} compact /> : null}
    </div>
  )
}

export interface LinkOutProps {
  to: LinkOutTarget
  children?: ReactNode
}

export function LinkOut({ to, children }: LinkOutProps) {
  return (
    <a href={`#${to.app}`} rel="noopener noreferrer" target="_blank" data-app={to.app}>
      {children ?? to.app}
    </a>
  )
}
