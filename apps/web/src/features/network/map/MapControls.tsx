import { useLingui } from '@lingui/react/macro'
import { Link } from '@tanstack/react-router'
import { useMemo } from 'react'
import { mnFilterFacets, mnHostLabels, type MnFilter } from '@/data/masternodes/filter'
import type { MnRow } from '@/data/masternodes/rows'
import { formatInt } from '@/lib/format'
import { SegFilter } from '@/ui'
import {
  COLOR_MODES,
  TONE_COLOR,
  CATEGORY_LABEL,
  filterSearch,
  listFilter,
  type ColorMode,
  type ColorScheme,
  type Headline,
  type MapView,
  type GeoTotals,
} from './map-model'
import { mnCount } from './counts'
import type { MapSearchControls } from './use-map-search'
import { countryName } from './NodeCard'

type SelectFacet = 'type' | 'version' | 'country' | 'host' | 'dkg'

interface Option {
  value: string
  label: string
}

const valuesOf = (filter: MnFilter, field: keyof MnFilter): string[] => {
  const v = filter[field]
  return v === undefined ? [] : Array.isArray(v) ? [...v] : [String(v)]
}

export function useCategoryLabel() {
  const { i18n } = useLingui()
  return (key: string): string => {
    const d = CATEGORY_LABEL[key]
    return d ? i18n._(d) : key
  }
}

export function HeadlineText({ h }: { h: Headline }) {
  const { t } = useLingui()
  const total = mnCount(h.total)
  const [answered, enabled, enabledAnswered, banned, bannedAnswered] = [
    formatInt(h.answered),
    formatInt(h.enabled.total),
    formatInt(h.enabled.answered),
    formatInt(h.banned.total),
    formatInt(h.banned.answered),
  ]
  return (
    <>
      {h.banned.total > 0
        ? t`${answered} of ${total} answered the latest crawl: ${enabledAnswered} of ${enabled} enabled and ${bannedAnswered} of ${banned} PoSe-banned.`
        : t`${answered} of ${total} answered the latest crawl.`}
      <span className="dh-sr">{t`Counts follow the filters and the shown categories.`}</span>
    </>
  )
}

export interface MapControlsProps {
  rows: readonly MnRow[]
  view: MapView
  scheme: ColorScheme
  controls: MapSearchControls
  geo: GeoTotals | undefined
  layer: 'mn' | 'nodes'
  /** The sheet or panel asks for the controls to be open. */
  onChanged?: () => void
}

/** The layer switch, colouring, category chips and selects. */
export function MapControls({
  rows,
  view,
  scheme,
  controls,
  geo,
  layer,
  onChanged,
}: MapControlsProps) {
  const { t, i18n } = useLingui()
  const label = useCategoryLabel()
  const { search, filter, hidden, set } = controls
  const facets = useMemo(() => mnFilterFacets(rows), [rows])
  const hostLabels = useMemo(() => mnHostLabels(rows), [rows])
  const modeLabels: Record<ColorMode, string> = {
    reach: t`Reachability`,
    pose: t`PoSe`,
    version: t`Version`,
    type: t`Type`,
  }

  const options = (facet: SelectFacet): Option[] => {
    const counts = facets[facet]
    const known = new Set([...Object.keys(counts), ...valuesOf(filter, facet)])
    const named = (value: string): string => {
      switch (facet) {
        case 'type':
          return value === 'evo' ? t`Evonodes` : t`Masternodes`
        case 'country': {
          const n = countryName(value, i18n.locale)
          return n && n !== value ? `${n} (${value})` : value
        }
        case 'host':
          return hostLabels[value] ?? `AS${value}`
        default:
          return value
      }
    }
    return [...known]
      .sort(
        facet === 'version'
          ? (a, b) => b.localeCompare(a, 'en', { numeric: true })
          : (a, b) => (counts[b] ?? 0) - (counts[a] ?? 0) || named(a).localeCompare(named(b)),
      )
      .map((value) => ({ value, label: `${named(value)} · ${formatInt(counts[value] ?? 0)}` }))
  }

  const facetLabel: Record<SelectFacet, string> = {
    type: t`Type`,
    version: t`Version`,
    country: t`Country`,
    host: t`Hosting`,
    dkg: t`DKG readiness`,
  }
  const anyLabel: Record<SelectFacet, string> = {
    type: t`Any type`,
    version: t`Any version`,
    country: t`Any country`,
    host: t`Any hosting`,
    dkg: t`Any DKG readiness`,
  }
  const facetIds: SelectFacet[] = Object.keys(facets.dkg).length
    ? ['type', 'version', 'country', 'host', 'dkg']
    : ['type', 'version', 'country', 'host']

  const choose = (facet: SelectFacet, value: string) => {
    set({ [facet]: value === '' ? undefined : [value] })
    onChanged?.()
  }

  const counts = view.counts
  return (
    <>
      <div className="rx-map-row">
        <span className="rx-map-label">{t`Show`}</span>
        <SegFilter
          label={t`Show`}
          value={layer}
          onChange={(id) => {
            set({ layer: id as 'mn' | 'nodes', protx: undefined })
          }}
          options={[
            { id: 'mn', label: t`Masternodes` },
            { id: 'nodes', label: geo ? t`All nodes` : t`All nodes (soon)`, disabled: !geo },
          ]}
        />
      </div>
      {layer === 'mn' ? (
        <>
          <div className="rx-map-row">
            <span className="rx-map-label">{t`Colour`}</span>
            <SegFilter
              label={t`Colour by`}
              value={search.color}
              onChange={(id) => {
                set({ color: id as ColorMode, hide: undefined })
              }}
              options={COLOR_MODES.map((m) => ({ id: m, label: modeLabels[m] }))}
            />
          </div>
          <div className="rx-map-chips" role="group" aria-label={t`Show or hide categories`}>
            {scheme.order
              .filter((k) => (counts.get(k) ?? 0) > 0 || hidden.has(k))
              .map((k) => {
                const on = !hidden.has(k)
                const next = new Set(hidden)
                if (on) next.add(k)
                else next.delete(k)
                return (
                  <button
                    key={k}
                    type="button"
                    className="rx-map-chip"
                    aria-pressed={on}
                    data-chip={k}
                    title={on ? t`Hide ${label(k)}` : t`Show ${label(k)}`}
                    onClick={() => {
                      set({ hide: next.size ? [...next].sort() : undefined })
                    }}
                  >
                    <i style={{ background: TONE_COLOR[scheme.toneOf(k)] }} />
                    <span>{label(k)}</span>
                    <b>{formatInt(counts.get(k) ?? 0)}</b>
                  </button>
                )
              })}
          </div>
          <div className="rx-map-selects">
            {facetIds.map((f) => {
              const chosen = valuesOf(filter, f)
              const value = chosen.length === 0 ? '' : chosen.length === 1 ? chosen[0]! : '__many'
              return (
                <label key={f} className="rx-map-select">
                  <span>{facetLabel[f]}</span>
                  <select
                    className="dh-input dh-input--sm"
                    value={value}
                    data-facet={f}
                    onChange={(e) => {
                      choose(f, e.target.value)
                    }}
                  >
                    <option value="">{anyLabel[f]}</option>
                    {value === '__many' ? (
                      <option value="__many" disabled>
                        {t`${chosen.length} selected`}
                      </option>
                    ) : null}
                    {options(f).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              )
            })}
          </div>
        </>
      ) : (
        <div className="rx-map-chips" data-static-chips>
          <span className="rx-map-chip" data-static>
            <i style={{ background: TONE_COLOR.s2 }} />
            <span>{t`Masternodes`}</span>
          </span>
          <span className="rx-map-chip" data-static>
            <i style={{ background: TONE_COLOR.evo }} />
            <span>{t`Other full nodes`}</span>
          </span>
        </div>
      )}
    </>
  )
}

/** "Open these as a list": the list with the same filter fields. */
export function ListLink({
  scheme,
  controls,
}: {
  scheme: ColorScheme
  controls: MapSearchControls
}) {
  const { t } = useLingui()
  const filter = listFilter(controls.filter, scheme, controls.hidden)
  return (
    <Link to="/masternodes" search={filterSearch(filter) as never} data-open-list>
      {t`Open these as a list`}
    </Link>
  )
}
