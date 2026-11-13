import type { ReactNode } from 'react'

const MAX = 60

function plain(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof Uint8Array)
    return `0x${Array.from(value, (b) => b.toString(16).padStart(2, '0')).join('')}`
  return JSON.stringify(value, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v)) ?? ''
}

/** One property of a document in a table cell: short, with the whole value in the tooltip. */
export function cellText(value: unknown): ReactNode {
  if (value === undefined || value === null) return '—'
  const text = plain(value)
  if (text.length <= MAX) return <span className="inline-block max-w-[20ch] break-all">{text}</span>
  return (
    <span className="inline-block max-w-[20ch] break-all" title={text}>
      {text.slice(0, MAX - 1)}…
    </span>
  )
}
