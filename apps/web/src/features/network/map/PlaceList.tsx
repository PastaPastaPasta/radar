import { useLingui } from '@lingui/react/macro'
import { useState, type ReactNode } from 'react'
import { formatInt } from '@/lib/format'
import type { Place } from './map-model'

export interface PlaceListProps {
  places: readonly Place[]
  /** How many places hold half; a rule follows that row. */
  toHalf: number | undefined
  /** The rule's words: "Half of the masternodes run in the cities above". */
  halfLine: string
  selected: string | undefined
  /** Picks a city, or unpicks it when it is the picked one. */
  onSelect: (id: string | undefined) => void
  name: (p: Place) => ReactNode
  share: (n: number) => string
  /** How many rows show before "Show all". */
  limit: number
}

/** Every city, largest first, with its share of the whole: the map's text and its keyboard path. */
export function PlaceList({
  places,
  toHalf,
  halfLine,
  selected,
  onSelect,
  name,
  share,
  limit,
}: PlaceListProps) {
  const { t } = useLingui()
  const [all, setAll] = useState(false)
  const at = selected ? places.findIndex((p) => p.id === selected) : -1
  const shown = all ? places : places.slice(0, Math.max(limit, at + 1))
  const max = Math.max(1, places[0]?.n ?? 1)
  return (
    <div className="rx-places" data-places>
      <ol className="rx-places__list" aria-label={t`Cities, largest first`}>
        {shown.map((p, i) => (
          <li key={p.id} className="rx-places__row" data-place-row={p.id}>
            <button
              type="button"
              className="rx-places__btn"
              aria-pressed={p.id === selected}
              onClick={() => {
                onSelect(p.id === selected ? undefined : p.id)
              }}
            >
              <span className="rx-places__rank" aria-hidden="true">
                {formatInt(i + 1)}
              </span>
              <span className="rx-places__name">{name(p)}</span>
              <span className="rx-places__n">{formatInt(p.n)}</span>
              <span className="rx-places__pct">{share(p.n)}</span>
              <span
                className="rx-places__bar"
                aria-hidden="true"
                style={{ width: `${String((p.n / max) * 100)}%` }}
              />
            </button>
            {toHalf !== undefined && i + 1 === toHalf && toHalf < places.length ? (
              <p className="rx-places__half" data-half-line>
                {halfLine}
              </p>
            ) : null}
          </li>
        ))}
      </ol>
      {places.length > shown.length || all ? (
        <button
          type="button"
          className="rx-linkbtn rx-places__more"
          aria-expanded={all}
          onClick={() => {
            setAll(!all)
          }}
        >
          {all ? t`Show fewer` : t`Show all ${formatInt(places.length)} cities`}
        </button>
      ) : null}
    </div>
  )
}
