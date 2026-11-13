import { useLingui } from '@lingui/react/macro'
import { useId, useState, type ReactNode } from 'react'
import { FilterButton } from '@/ui'

/** The filter controls: always in view on a wide screen, behind a "Filters" button on a phone. */
export function FilterPanel({ count, children }: { count: number; children: ReactNode }) {
  const { t } = useLingui()
  const [open, setOpen] = useState(false)
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2 rx-only-sm">
        <FilterButton
          label={t`Filters`}
          value={String(count)}
          on={open || count > 0}
          phoneOnly
          onClick={() => {
            setOpen(!open)
          }}
        />
      </div>
      <div
        className={`flex flex-wrap items-center gap-2 border-b border-line px-4 py-3${open ? '' : ' rx-hide-sm'}`}
        data-filter-panel
      >
        {children}
      </div>
    </>
  )
}

/**
 * A text filter that is sent on Enter or when focus leaves it, so a half-typed value never reaches the address.
 * `check` returns an error message for a value that cannot be used.
 */
export function TextFilter({
  label,
  placeholder,
  value,
  check,
  normalise,
  onChange,
}: {
  label: string
  placeholder: string
  value: string | undefined
  check?: (value: string) => string | undefined
  normalise?: (value: string) => string
  onChange: (value: string | undefined) => void
}) {
  const id = useId()
  const [seen, setSeen] = useState(value)
  const [draft, setDraft] = useState(value ?? '')
  const [error, setError] = useState<string>()
  if (seen !== value) {
    setSeen(value)
    setDraft(value ?? '')
    setError(undefined)
  }
  const commit = () => {
    const text = draft.trim()
    if (text === '') {
      setError(undefined)
      if (value !== undefined) onChange(undefined)
      return
    }
    const problem = check?.(text)
    if (problem) {
      setError(problem)
      return
    }
    setError(undefined)
    const next = normalise ? normalise(text) : text
    if (next !== value) onChange(next)
  }
  return (
    <div className="inline-flex flex-wrap items-center gap-2" role="group" aria-label={label}>
      <label htmlFor={id} className="text-sm">
        {label}
      </label>
      <input
        id={id}
        type="text"
        className="dh-input dh-input--sm"
        style={{ width: 'min(100%, 22rem)' }}
        value={draft}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        aria-invalid={error ? true : undefined}
        onChange={(e) => {
          setDraft(e.target.value)
          if (e.target.value === '') setError(undefined)
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
        }}
      />
      {error ? (
        <span role="alert" className="basis-full text-bad text-sm">
          {error}
        </span>
      ) : null}
    </div>
  )
}
