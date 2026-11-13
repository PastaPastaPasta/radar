import { t } from '@lingui/core/macro'
import { Trans } from '@lingui/react/macro'
import { useId, useState, type FocusEvent, type ReactNode } from 'react'
import { formatInt } from '@/lib/format'
import { zIsoDate, zRange } from '@/lib/search-schemas'
import { cx } from './cx'
import { Icon } from './icon'

export function TableTools({ children }: { children: ReactNode }) {
  return <div className="rx-tools">{children}</div>
}

export interface SegFilterProps {
  label: string
  options: { id: string; label: ReactNode; count?: number; disabled?: boolean }[]
  value: string
  onChange: (id: string) => void
}

export function SegFilter({ label, options, value, onChange }: SegFilterProps) {
  return (
    <div className="dh-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={o.id === value}
          disabled={o.disabled}
          onClick={() => {
            onChange(o.id)
          }}
        >
          {o.label}
          {o.count === undefined ? null : <span className="dh-count"> {formatInt(o.count)}</span>}
        </button>
      ))}
    </div>
  )
}

export interface SearchFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export function SearchField({ label, value, onChange, placeholder }: SearchFieldProps) {
  return (
    <label className="rx-search rx-grow">
      <Icon name="search" />
      <span className="dh-sr">{label}</span>
      <input
        className="dh-input dh-input--sm"
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value)
        }}
      />
    </label>
  )
}

export interface FilterButtonProps {
  label: ReactNode
  value?: ReactNode
  on?: boolean
  phoneOnly?: boolean
  hideOnPhone?: boolean
  onClick?: () => void
}

export function FilterButton({
  label,
  value,
  on,
  phoneOnly,
  hideOnPhone,
  onClick,
}: FilterButtonProps) {
  return (
    <button
      type="button"
      className={cx(
        'rx-filter',
        on && 'is-on',
        phoneOnly && 'rx-only-sm',
        hideOnPhone && 'rx-hide-sm',
      )}
      aria-pressed={on}
      onClick={onClick}
    >
      {phoneOnly ? <Icon name="filter" /> : null}
      {label}
      {value === undefined ? null : <span className="rx-count"> {value}</span>}
    </button>
  )
}

export interface ActiveFiltersProps {
  matches: number
  tokens: { id: string; label: string }[]
  onRemove: (id: string) => void
  onClear: () => void
  children?: ReactNode
}

export function ActiveFilters({
  matches,
  tokens,
  onRemove,
  onClear,
  children,
}: ActiveFiltersProps) {
  return (
    <div className="rx-activef" role="status">
      <span>
        <Trans>
          <b>{formatInt(matches)}</b> match
        </Trans>
      </span>
      {tokens.map((tok) => (
        <span key={tok.id} className="rx-token">
          {tok.label}
          <button
            type="button"
            aria-label={t`Remove filter ${tok.label}`}
            onClick={() => {
              onRemove(tok.id)
            }}
          >
            <Icon name="x" size="sm" />
          </button>
        </span>
      ))}
      {tokens.length > 0 ? (
        <button type="button" className="dh-btn dh-btn--link" onClick={onClear}>
          {t`Clear`}
        </button>
      ) : null}
      {children ? <span className="rx-activef__note rx-hide-sm">{children}</span> : null}
    </div>
  )
}

const FIELD_GROUP =
  'inline-flex min-h-[var(--dh-ctl-h-sm)] flex-wrap items-center gap-x-2 gap-y-1 rounded-2 border px-2.5 py-1 text-[length:var(--dh-fs-sm)]'
const FIELD_GROUP_OFF = 'border-line-2 bg-surface'
const FIELD_GROUP_ON = 'border-select bg-select-soft shadow-[inset_0_0_0_1px_var(--dh-select)]'

function leaveGroup(e: FocusEvent<HTMLElement>, commit: () => void) {
  if (!e.currentTarget.contains(e.relatedTarget)) commit()
}

function ClearButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="inline-flex size-6 items-center justify-center rounded-1 border-0 bg-transparent p-0 text-ink-2 hover:bg-hover"
      aria-label={label}
      onClick={onClick}
    >
      <Icon name="x" size="sm" />
    </button>
  )
}

function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <span id={id} role="alert" className="basis-full text-bad">
      {children}
    </span>
  )
}

function splitRange(value: string | undefined): [string, string] {
  if (value === undefined || !zRange.safeParse(value).success) return ['', '']
  const [lo = '', hi = ''] = value.split('..')
  return [lo, hi]
}

export interface RangeFilterProps {
  label: string
  /** The `min..max` form of the `zRange` search field; either side may be empty. */
  value?: string
  onChange: (value: string | undefined) => void
}

/** Two number boxes for a `zRange` field. A change is sent on Enter or when focus leaves the pair. */
export function RangeFilter({ label, value, onChange }: RangeFilterProps) {
  const errorId = useId()
  const [seen, setSeen] = useState(value)
  const [[lo, hi], setDraft] = useState(() => splitRange(value))
  const [error, setError] = useState<string>()
  if (seen !== value) {
    setSeen(value)
    setDraft(splitRange(value))
    setError(undefined)
  }

  const commit = () => {
    const a = lo.trim()
    const b = hi.trim()
    if (!a && !b) {
      setError(undefined)
      if (value !== undefined) onChange(undefined)
      return
    }
    const next = `${a}..${b}`
    if (a && b && Number(a) > Number(b)) {
      setError(t`The minimum is above the maximum.`)
      return
    }
    if (!zRange.safeParse(next).success) {
      setError(t`Enter plain numbers, like 100 or 2.5.`)
      return
    }
    setError(undefined)
    if (next !== value) onChange(next)
  }
  const field = (side: 'min' | 'max', text: string) => (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      className="dh-input dh-input--sm"
      style={{ width: 84 }}
      value={side === 'min' ? lo : hi}
      placeholder={side === 'min' ? t`Min` : t`Max`}
      aria-label={text}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? errorId : undefined}
      onChange={(e) => {
        const v = e.target.value
        setDraft(side === 'min' ? [v, hi] : [lo, v])
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
      }}
    />
  )
  const active = value !== undefined && zRange.safeParse(value).success
  return (
    <div
      className={cx(FIELD_GROUP, active ? FIELD_GROUP_ON : FIELD_GROUP_OFF)}
      role="group"
      aria-label={label}
      onBlur={(e) => {
        leaveGroup(e, commit)
      }}
    >
      <span className="font-[var(--dh-w-ui)]">{label}</span>
      {field('min', t`${label} minimum`)}
      <span aria-hidden="true">–</span>
      {field('max', t`${label} maximum`)}
      {active || lo || hi ? (
        <ClearButton
          label={t`Clear ${label}`}
          onClick={() => {
            setDraft(['', ''])
            setError(undefined)
            onChange(undefined)
          }}
        />
      ) : null}
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </div>
  )
}

export interface DateRangeValue {
  from?: string
  to?: string
}

export interface DateRangeFilterProps {
  label: string
  /** `zIsoDate` forms (`2026-10-31`), the two search fields `from` and `to`. */
  from?: string
  to?: string
  onChange: (range: DateRangeValue) => void
}

const validDate = (v: string | undefined) => v !== undefined && zIsoDate.safeParse(v).success

/** Two date boxes for a `from` and a `to` field; each change is sent as soon as the date is whole. */
export function DateRangeFilter({ label, from, to, onChange }: DateRangeFilterProps) {
  const errorId = useId()
  const [seen, setSeen] = useState({ from, to })
  const [draft, setDraft] = useState({ from: from ?? '', to: to ?? '' })
  const [error, setError] = useState<string>()
  if (seen.from !== from || seen.to !== to) {
    setSeen({ from, to })
    setDraft({ from: from ?? '', to: to ?? '' })
    setError(undefined)
  }

  const change = (side: 'from' | 'to', raw: string) => {
    setDraft((d) => ({ ...d, [side]: raw }))
    const next = { from: draft.from, to: draft.to, [side]: raw }
    if (raw !== '' && !validDate(raw)) return
    if (next.from && next.to && next.from > next.to) {
      setError(t`The start date is after the end date.`)
      return
    }
    setError(undefined)
    onChange({ ...(next.from ? { from: next.from } : {}), ...(next.to ? { to: next.to } : {}) })
  }
  const field = (side: 'from' | 'to', text: string) => (
    <input
      type="date"
      className="dh-input dh-input--sm"
      value={draft[side]}
      min={side === 'to' && validDate(draft.from) ? draft.from : undefined}
      max={side === 'from' && validDate(draft.to) ? draft.to : undefined}
      aria-label={text}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? errorId : undefined}
      onChange={(e) => {
        change(side, e.target.value)
      }}
    />
  )
  const active = validDate(from) || validDate(to)
  return (
    <div
      className={cx(FIELD_GROUP, active ? FIELD_GROUP_ON : FIELD_GROUP_OFF)}
      role="group"
      aria-label={label}
    >
      <span className="font-[var(--dh-w-ui)]">{label}</span>
      {field('from', t`${label} from`)}
      <span aria-hidden="true">–</span>
      {field('to', t`${label} to`)}
      {active || draft.from || draft.to ? (
        <ClearButton
          label={t`Clear ${label}`}
          onClick={() => {
            setDraft({ from: '', to: '' })
            setError(undefined)
            onChange({})
          }}
        />
      ) : null}
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </div>
  )
}
