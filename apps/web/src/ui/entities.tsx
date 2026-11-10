import type { ReactNode } from 'react'
import type { EntityKind } from './types'

export interface HashProps {
  value: string
  display?: 'short' | 'full' | 'wrap'
  head?: number
  tail?: number
  copy?: boolean
}

export function Hash({ value, display = 'short', head = 6, tail = 4, copy = true }: HashProps) {
  const shown =
    display === 'short' && value.length > head + tail + 1
      ? `${value.slice(0, head)}…${value.slice(-tail)}`
      : value
  return (
    <span data-display={display}>
      <code title={value}>{shown}</code>
      {copy ? <Copy value={value} /> : null}
    </span>
  )
}

export interface CopyProps {
  value: string
  label?: string
}

export function Copy({ value, label = 'Copy' }: CopyProps) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => {
        void navigator.clipboard.writeText(value)
      }}
    >
      {label}
    </button>
  )
}

export interface EntityChipProps {
  kind: EntityKind
  id: string
  label?: ReactNode
  href?: string | false
  copy?: boolean
  hover?: boolean
  size?: 'sm' | 'md'
  identicon?: boolean
}

export function EntityChip({ kind, id, label, href, copy = true, size = 'md' }: EntityChipProps) {
  const text = label ?? id
  return (
    <span data-entity={kind} data-id={id} data-size={size}>
      {href ? <a href={href}>{text}</a> : <span>{text}</span>}
      {copy ? <Copy value={id} /> : null}
    </span>
  )
}
