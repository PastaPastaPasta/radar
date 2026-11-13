import { useLingui } from '@lingui/react/macro'
import type { ReactNode } from 'react'

export interface MultiSelectOption {
  id: string
  /** What the option looks like in the list. */
  node: ReactNode
  /** What it is called, for the accessible name and the filter token. */
  text: string
}

/** A choice of several values behind one button: a native disclosure with a checkbox per value. */
export function MultiSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: readonly MultiSelectOption[]
  value: readonly string[]
  onChange: (value: string[]) => void
}) {
  const { t } = useLingui()
  const chosen = new Set(value)
  return (
    <details className="relative" data-multi={label}>
      <summary
        className={`rx-filter${value.length > 0 ? ' is-on' : ''}`}
        style={{ cursor: 'pointer', listStyle: 'none' }}
      >
        {label}
        {value.length > 0 ? <span className="rx-count"> {value.length}</span> : null}
      </summary>
      <fieldset className="absolute z-20 mt-1 m-0 max-h-72 min-w-56 overflow-auto rounded-2 border border-line-2 bg-surface p-2 shadow-lg">
        <legend className="dh-sr">{label}</legend>
        {value.length > 0 ? (
          <button
            type="button"
            className="dh-btn dh-btn--link mb-1"
            onClick={() => {
              onChange([])
            }}
          >
            {t`Clear`}
          </button>
        ) : null}
        <div className="grid gap-1">
          {options.map((o) => (
            <label key={o.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={chosen.has(o.id)}
                aria-label={o.text}
                onChange={() => {
                  onChange(
                    chosen.has(o.id) ? value.filter((v) => v !== o.id) : [...value, o.id],
                  )
                }}
              />
              {o.node}
            </label>
          ))}
        </div>
      </fieldset>
    </details>
  )
}
