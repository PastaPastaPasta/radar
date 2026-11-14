import { Trans, useLingui } from '@lingui/react/macro'
import { Link } from '@tanstack/react-router'
import { useCallback, useMemo } from 'react'
import { filterMnRows, type MnFilter } from '@/data/masternodes/filter'
import { mnCsvColumns, mnCsvName } from '@/data/masternodes/export'
import { toCsv } from '@/data/masternodes/csv'
import type { MnRow, MnRows } from '@/data/masternodes/rows'
import { sortMnRows } from '@/data/masternodes/sort'
import { useNetwork } from '@/features/entity'
import type { NetworkId } from '@/lib/network'
import { DataTable, Empty } from '@/ui'
import type { SourceStamp } from '@/data/envelope'
import { MAINNET_BLOCK_MS, useMnColumns } from './columns'
import { downloadText } from './download'
import { FilterBar, sortOptionsOf } from './FilterBar'
import { filterFields } from './filter-fields'
import { StatusBar } from './StatusBar'
import { useRestoreScroll } from './use-scroll-restore'
import { mnPageLink, type MnPageSearch, type MnSearchControls } from './use-mn-search'

export const PAGE_SIZE = 100

const hasCrawl = (data: MnRows) => data.radar !== null && data.rows.some((r) => r.crawl)

/** The rows the filters and the sort in the address leave, in order. */
export function useMnMatches(rows: readonly MnRow[] | undefined, search: MnPageSearch): MnRow[] {
  return useMemo(
    () => (rows ? sortMnRows(filterMnRows(rows, search), search.sort) : []),
    [rows, search],
  )
}

/** What the page head offers for the list: the matching rows as a CSV, and the same filters on the map. */
export function ListActions({
  data,
  net,
  search,
  matches,
}: {
  data: MnRows
  net: NetworkId
  search: MnPageSearch
  matches: readonly MnRow[]
}) {
  const { t } = useLingui()
  const crawl = hasCrawl(data)
  return (
    <>
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
      <button
        type="button"
        className="dh-btn dh-btn--sm"
        data-export-csv
        onClick={() => {
          downloadText(mnCsvName(net), toCsv(matches, mnCsvColumns(crawl)))
        }}
      >
        {t`Download CSV`}
      </button>
    </>
  )
}

export interface ListViewProps {
  data: MnRows
  controls: MnSearchControls
  /** The rows the filters leave, sorted: `useMnMatches`. */
  matches: MnRow[]
  stamps: SourceStamp[]
}

export function ListView({ data, controls, matches, stamps }: ListViewProps) {
  const { t } = useLingui()
  const { search } = controls
  const net = useNetwork()
  const onEvoFilter = useCallback(() => {
    controls.filter({ type: ['evo'] })
  }, [controls])
  const crawl = hasCrawl(data)
  const tip = data.radar?.height ?? 0
  const columns = useMnColumns({
    crawl,
    tip,
    blockMs: net === 'mainnet' ? MAINNET_BLOCK_MS : undefined,
    onEvoFilter,
  })
  const pages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE))
  const page = Math.min(search.page, pages)
  const shown = useMemo(
    () => matches.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [matches, page],
  )
  useRestoreScroll(shown.length > 0)
  const sortOptions = useMemo(() => sortOptionsOf(columns), [columns])

  return (
    <div className="rx-mnlist" data-quiet-copy>
      <StatusBar rows={data.rows} />
      <FilterBar
        rows={data.rows}
        matches={matches.length}
        crawl={crawl}
        controls={controls}
        sortOptions={sortOptions}
      />
      <div className="min-[1024px]:overflow-x-auto min-[1024px]:[&_th]:static">
        <DataTable
          caption={t`Masternodes`}
          columns={columns}
          rows={shown}
          getRowId={(r) => r.protx}
          rowLink={(r) => ({ to: '/mn/$protx', params: { protx: r.protx } }) as never}
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
                  total: matches.length,
                  to: mnPageLink,
                }
              : undefined
          }
          virtual
          dense
          onCellFilter={(column, value) => {
            controls.filter(cellFilter(column, value))
          }}
          phone="cards"
          source={stamps}
        />
      </div>
    </div>
  )
}

/** The filter a click on a cell of `column` asks for. */
export function cellFilter(column: string, value: string): Partial<MnFilter> {
  switch (column) {
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
