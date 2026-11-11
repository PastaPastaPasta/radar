import { t } from '@lingui/core/macro'
import { Trans } from '@lingui/react/macro'
import type { ReactNode } from 'react'
import { formatInt } from '@/lib/format'
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
