import { useLingui } from '@lingui/react/macro'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import { mnFilterFacets, mnHostLabels, type MnFilter } from '@/data/masternodes/filter'
import type { MnRow } from '@/data/masternodes/rows'
import { formatInt } from '@/lib/format'
import { ActiveFilters, FilterButton, SearchField, SegFilter, TableTools } from '@/ui'
import { useDebouncedQuery } from '../debounced-query'
import type { MnSearchControls } from './use-mn-search'

type FacetId = 'status' | 'reach' | 'version' | 'country' | 'host' | 'dkg'
const CRAWL_FACETS: FacetId[] = ['reach', 'version', 'country', 'host', 'dkg']
const ALL_FIELDS = ['type', 'status', 'reach', 'country', 'version', 'host', 'dkg'] as const

interface Option {
  value: string
  label: string
  count: number
}

export interface SortOption {
  id: string
  label: string
}

export function sortOptionsOf<Row>(columns: readonly ColumnDef<Row>[]): SortOption[] {
  return columns.flatMap((c) =>
    c.id && typeof c.header === 'string' ? [{ id: c.id, label: c.header }] : [],
  )
}

/** On a phone the table shows cards, with no headers to click: a select and a direction button sort instead. */
export function SortPicker({
  controls,
  options,
}: {
  controls: MnSearchControls
  options: SortOption[]
}) {
  const { t } = useLingui()
  const { sort } = controls.search
  const value = sort.replace(/^-/, '')
  const desc = sort.startsWith('-')
  return (
    <div className="rx-only-sm flex items-center gap-2 text-sm">
      <label className="flex items-center gap-2">
        <span className="whitespace-nowrap">{t`Sort by`}</span>
        <select
          className="dh-input dh-input--sm"
          data-sort-select
          value={value}
          onChange={(e) => {
            controls.sort({ sort: desc ? `-${e.target.value}` : e.target.value })
          }}
        >
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="dh-btn dh-btn--sm"
        aria-label={desc ? t`Descending. Switch to ascending` : t`Ascending. Switch to descending`}
        onClick={() => {
          controls.sort({ sort: desc ? value : `-${value}` })
        }}
      >
        {desc ? '↓' : '↑'}
      </button>
    </div>
  )
}

const valuesOf = (filter: MnFilter, field: FacetId | 'type'): string[] => {
  const v = filter[field]
  return v === undefined ? [] : Array.isArray(v) ? [...v] : [v]
}

export interface FilterBarProps {
  /** All rows, before any filter: the options and their counts are of these. */
  rows: readonly MnRow[]
  matches: number
  /** Some row carries Radar's crawl: its filters are on offer. */
  crawl: boolean
  controls: MnSearchControls
  sortOptions: SortOption[]
}

export function FilterBar({ rows, matches, crawl, controls, sortOptions }: FilterBarProps) {
  const { t } = useLingui()
  const { search } = controls
  const facets = useMemo(() => mnFilterFacets(rows), [rows])
  const hostLabels = useMemo(() => mnHostLabels(rows), [rows])
  const [text, setText] = useDebouncedQuery(search.q, (q) => {
    controls.filter({ q })
  })
  const [open, setOpen] = useState<FacetId | 'all' | null>(null)

  const facetLabels: Record<FacetId | 'type', string> = {
    type: t`Type`,
    status: t`Status`,
    reach: t`Reachability`,
    version: t`Version`,
    country: t`Country`,
    host: t`Hosting`,
    dkg: t`DKG readiness`,
  }
  const optionLabel = (facet: FacetId | 'type', value: string): string => {
    switch (facet) {
      case 'type':
        return value === 'evo' ? t`Evonode` : t`Masternode`
      case 'status':
        return value === 'enabled' ? t`Enabled` : t`PoSe-banned`
      case 'reach':
        return value === 'reachable' ? t`Answering` : t`No answer`
      case 'host':
        return hostLabels[value] ?? `AS${value}`
      default:
        return value
    }
  }
  const optionsOf = (facet: FacetId): Option[] => {
    const known = new Set([...Object.keys(facets[facet]), ...valuesOf(search, facet)])
    const options = [...known].map((value) => ({
      value,
      label: optionLabel(facet, value),
      count: facets[facet][value] ?? 0,
    }))
    return options.sort(
      facet === 'version'
        ? (a, b) => b.value.localeCompare(a.value, 'en', { numeric: true })
        : (a, b) => b.count - a.count || a.label.localeCompare(b.label),
    )
  }

  const setFacet = (facet: FacetId | 'type', values: string[]) => {
    controls.filter({
      [facet]: facet === 'reach' ? values[0] : values.length > 0 ? values : undefined,
    })
  }
  const toggle = (facet: FacetId | 'type', value: string) => {
    const current = valuesOf(search, facet)
    setFacet(
      facet,
      current.includes(value)
        ? current.filter((v) => v !== value)
        : facet === 'reach'
          ? [value]
          : [...current, value],
    )
  }

  const facetIds: FacetId[] = crawl ? ['status', ...CRAWL_FACETS] : ['status']
  const fields: (FacetId | 'type')[] = ['type', ...facetIds]
  const active = fields.flatMap((facet) =>
    valuesOf(search, facet).map((value) => ({
      id: `${facet}:${value}`,
      facet,
      value,
      label: `${facetLabels[facet]}: ${optionLabel(facet, value)}`,
    })),
  )
  const typeValue = search.type?.length === 1 ? search.type[0]! : 'all'
  const panelFacets = open === 'all' ? facetIds : open ? [open] : []

  return (
    <>
      <TableTools>
        <SegFilter
          label={t`Type`}
          value={typeValue}
          onChange={(id) => {
            setFacet('type', id === 'all' ? [] : [id])
          }}
          options={[
            {
              id: 'all',
              label: t`All`,
              count: (facets.type.regular ?? 0) + (facets.type.evo ?? 0),
            },
            { id: 'regular', label: t`Masternodes`, count: facets.type.regular ?? 0 },
            { id: 'evo', label: t`Evonodes`, count: facets.type.evo ?? 0 },
          ]}
        />
        <SearchField
          label={t`Search masternodes`}
          placeholder={crawl ? t`ProTx, IP, payout address, host or city` : t`ProTx or IP`}
          value={text}
          onChange={setText}
        />
        {facetIds.map((facet) => {
          const chosen = valuesOf(search, facet)
          return (
            <FilterButton
              key={facet}
              label={facetLabels[facet]}
              value={chosen.length > 0 ? formatInt(chosen.length) : undefined}
              on={open === facet || chosen.length > 0}
              hideOnPhone
              onClick={() => {
                setOpen(open === facet ? null : facet)
              }}
            />
          )
        })}
        <FilterButton
          label={t`Filters`}
          value={formatInt(active.length)}
          on={open === 'all' || active.length > 0}
          phoneOnly
          onClick={() => {
            setOpen(open === 'all' ? null : 'all')
          }}
        />
        <SortPicker controls={controls} options={sortOptions} />
      </TableTools>
      {panelFacets.length > 0 ? (
        <div
          className="grid gap-4 border-b border-line p-4 sm:grid-cols-2 lg:grid-cols-3"
          data-filter-panel
        >
          {panelFacets.map((facet) => (
            <fieldset key={facet} className="m-0 min-w-0 border-0 p-0" data-facet={facet}>
              <legend className="mb-1 text-sm font-semibold">{facetLabels[facet]}</legend>
              <div className="grid max-h-56 gap-1 overflow-auto">
                {optionsOf(facet).map((o) => (
                  <label key={o.value} className="flex items-center gap-2 text-sm">
                    <input
                      type={facet === 'reach' ? 'radio' : 'checkbox'}
                      name={`mn-${facet}`}
                      checked={valuesOf(search, facet).includes(o.value)}
                      onChange={() => {
                        toggle(facet, o.value)
                      }}
                    />
                    <span className="min-w-0 flex-1 truncate">{o.label}</span>
                    <span className="text-ink-2">{formatInt(o.count)}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
      ) : null}
      <ActiveFilters
        matches={matches}
        tokens={active}
        onRemove={(id) => {
          const hit = active.find((a) => a.id === id)
          if (hit) toggle(hit.facet, hit.value)
        }}
        onClear={() => {
          setText('')
          controls.filter(Object.fromEntries([...ALL_FIELDS, 'q'].map((k) => [k, undefined])))
        }}
      />
    </>
  )
}
