import { Trans, useLingui } from '@lingui/react/macro'
import { Link } from '@tanstack/react-router'
import { useMemo } from 'react'
import { filterMnRows, type MnFilter } from '@/data/masternodes/filter'
import { mnCsvColumns, mnCsvName } from '@/data/masternodes/export'
import { toCsv } from '@/data/masternodes/csv'
import type { MnRows } from '@/data/masternodes/rows'
import { sortMnRows } from '@/data/masternodes/sort'
import type { NetworkId } from '@/lib/network'
import { DataTable, Empty } from '@/ui'
import type { SourceStamp } from '@/data/envelope'
import { useMnColumns } from './columns'
import { downloadText } from './download'
import { FilterBar, sortOptionsOf } from './FilterBar'
import { StatusBar } from './StatusBar'
import { useRestoreScroll } from './use-scroll-restore'
import { mnPageLink, type MnSearchControls } from './use-mn-search'

export const PAGE_SIZE = 250
const MAP_FIELDS = ['q', 'type', 'status', 'reach', 'country', 'version', 'host', 'dkg'] as const

/** The filter fields the address carries, for a link to another page that reads the same ones. */
export function filterFields(search: MnFilter): MnFilter {
  return Object.fromEntries(
    MAP_FIELDS.flatMap((k) => (search[k] === undefined ? [] : [[k, search[k]]])),
  )
}

export interface ListViewProps {
  data: MnRows
  net: NetworkId
  controls: MnSearchControls
  stamps: SourceStamp[]
}

export function ListView({ data, net, controls, stamps }: ListViewProps) {
  const { t } = useLingui()
  const { search } = controls
  const crawl = data.radar !== null && data.rows.some((r) => r.crawl)
  const evo = useMemo(() => data.rows.some((r) => r.type === 'evo'), [data.rows])
  const columns = useMnColumns({ crawl, evo })
  const filtered = useMemo(
    () => sortMnRows(filterMnRows(data.rows, search), search.sort),
    [data.rows, search],
  )
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const page = Math.min(search.page, pages)
  const shown = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page],
  )
  useRestoreScroll(shown.length > 0)
  const sortOptions = useMemo(() => sortOptionsOf(columns), [columns])

  const exportCsv = () => {
    downloadText(mnCsvName(net), toCsv(filtered, mnCsvColumns(crawl)))
  }

  return (
    <div className="grid min-w-0 gap-4">
      <StatusBar rows={data.rows} />
      <div className="rx-card min-w-0">
        <FilterBar
          rows={data.rows}
          matches={filtered.length}
          crawl={crawl}
          controls={controls}
          sortOptions={sortOptions}
        />
        <div className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm">
          <button type="button" className="dh-btn dh-btn--sm" data-export-csv onClick={exportCsv}>
            {t`Download CSV`}
          </button>
          {crawl ? (
            <Link
              className="dh-btn dh-btn--sm"
              data-view-on-map
              to="/map"
              search={filterFields(search) as never}
            >
              <Trans>View on map</Trans>
            </Link>
          ) : null}
        </div>
        <div className="min-[1024px]:overflow-x-auto min-[1024px]:[&_th]:static">
          <DataTable
            caption={t`Masternodes`}
            columns={columns}
            rows={shown}
            getRowId={(r) => r.protx}
            state={shown.length === 0 ? 'empty' : 'ready'}
            empty={
              <Empty
                kind="no-match"
                title={t`No masternodes match`}
                body={t`Clear a filter or search for something else.`}
              />
            }
            sort={{
              value: search.sort,
              onChange: (sort) => {
                controls.sort({ sort })
              },
            }}
            paging={
              pages > 1
                ? {
                    kind: 'page',
                    page,
                    limit: PAGE_SIZE,
                    total: filtered.length,
                    to: mnPageLink,
                  }
                : undefined
            }
            virtual
            onCellFilter={(column, value) => {
              controls.filter(cellFilter(column, value))
            }}
            phone="cards"
            source={stamps}
          />
        </div>
      </div>
    </div>
  )
}

/** The filter a click on a cell of `column` asks for. */
export function cellFilter(column: string, value: string): Partial<MnFilter> {
  switch (column) {
    case 'type':
      return { type: [value as 'regular' | 'evo'] }
    case 'status':
      return { status: [value as 'enabled' | 'pose-banned'] }
    case 'country':
      return { country: [value] }
    case 'version':
      return { version: [value] }
    case 'hosting':
      return { host: [value] }
    default:
      return {}
  }
}
