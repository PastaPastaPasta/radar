import { plural, t } from '@lingui/core/macro'
import { useState, type ReactNode } from 'react'
import { bytesToHex } from '@/lib/hex'
import { cx } from './cx'
import { Copy } from './hash'
import { Icon } from './icon'

export type JsonBytes = 'hex' | 'base64'

export interface JsonViewProps {
  value: unknown
  /** Depth from which containers start closed: 0 closes the root, 1 (default) opens only the root. */
  collapsedDepth?: number
  copy?: boolean
  maxHeight?: number | string
  bytes?: JsonBytes
  label?: string
}

const SHOWN_STEP = 100
const BYTES_HEAD = 48
const BYTES_TAIL = 16

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

export function encodeBytes(bytes: Uint8Array, as: JsonBytes): string {
  return as === 'base64' ? toBase64(bytes) : bytesToHex(bytes)
}

/** The text the copy button puts on the clipboard: JSON with bigints as digit strings and bytes encoded. */
export function jsonText(value: unknown, bytes: JsonBytes = 'hex'): string {
  const seen = new WeakSet<object>()
  const text = JSON.stringify(
    value,
    (_key, v: unknown) => {
      if (typeof v === 'bigint') return v.toString()
      if (v instanceof Uint8Array) return encodeBytes(v, bytes)
      if (v instanceof Map)
        return Object.fromEntries([...v].map(([k, x]) => [String(k), x as unknown]))
      if (typeof v === 'object' && v !== null) {
        if (seen.has(v)) return '[circular]'
        seen.add(v)
      }
      return v
    },
    2,
  )
  return text ?? String(value)
}

interface Ctx {
  bytes: JsonBytes
  openDepth: number
}

type Entry = [key: string, value: unknown]

function entriesOf(value: unknown): Entry[] | null {
  if (Array.isArray(value)) return value.map((v, i): Entry => [String(i), v])
  if (value instanceof Map) return [...value].map(([k, v]): Entry => [String(k), v])
  if (typeof value === 'object' && value !== null && !isLeafObject(value)) {
    return Object.entries(value)
  }
  return null
}

function isLeafObject(value: object): boolean {
  return value instanceof Uint8Array || value instanceof Date
}

function countText(value: unknown, n: number): string {
  return Array.isArray(value)
    ? plural(n, { one: '# item', other: '# items' })
    : plural(n, { one: '# key', other: '# keys' })
}

function Scalar({ value, bytes }: { value: unknown; bytes: JsonBytes }) {
  if (value === null) return <span className="text-ink-2">null</span>
  if (value === undefined) return <span className="text-ink-2">undefined</span>
  if (typeof value === 'string') {
    return <span className="break-all text-ink">{JSON.stringify(value)}</span>
  }
  if (typeof value === 'number') return <span className="text-brand-ink">{String(value)}</span>
  if (typeof value === 'bigint') {
    return (
      <span className="text-brand-ink">
        {value.toString()}
        <span className="text-ink-3" aria-hidden="true">
          n
        </span>
      </span>
    )
  }
  if (typeof value === 'boolean') return <span className="text-brand-ink">{String(value)}</span>
  if (value instanceof Date) {
    const ms = value.getTime()
    return (
      <span className="text-ink">
        {Number.isNaN(ms) ? t`invalid date` : JSON.stringify(value.toISOString())}
      </span>
    )
  }
  if (value instanceof Uint8Array) return <BytesValue value={value} as={bytes} />
  return (
    <span className="text-ink-2">
      {typeof value === 'function' ? t`function` : (value as symbol).toString()}
    </span>
  )
}

function BytesValue({ value, as }: { value: Uint8Array; as: JsonBytes }) {
  const full = encodeBytes(value, as)
  const cut = value.length > BYTES_HEAD + BYTES_TAIL
  const shown = cut
    ? `${encodeBytes(value.subarray(0, BYTES_HEAD), as)}…${encodeBytes(value.subarray(-BYTES_TAIL), as)}`
    : full
  const n = value.length
  return (
    <span className="break-all">
      <span className="text-ink-2">{as === 'hex' ? '0x' : 'base64:'}</span>
      <span className="text-ink" title={cut ? full : undefined}>
        {shown}
      </span>{' '}
      <span className="text-ink-2">{plural(n, { one: '(# byte)', other: '(# bytes)' })}</span>
    </span>
  )
}

function KeyLabel({ name, indexed }: { name: string | undefined; indexed: boolean }) {
  if (name === undefined) return null
  return (
    <>
      <span className={indexed ? 'text-ink-2' : 'text-ink'}>
        {indexed ? name : JSON.stringify(name)}
      </span>
      <span className="text-ink-3">: </span>
    </>
  )
}

function Row({
  name,
  indexed,
  value,
  depth,
  ancestors,
  ctx,
}: {
  name?: string
  indexed: boolean
  value: unknown
  depth: number
  ancestors: readonly object[]
  ctx: Ctx
}) {
  const entries = entriesOf(value)
  const isCircular = typeof value === 'object' && value !== null && ancestors.includes(value)
  if (entries === null || isCircular) {
    return (
      <li className="min-h-6 py-px pl-[22px] leading-6">
        <KeyLabel name={name} indexed={indexed} />
        {isCircular ? (
          <span className="text-ink-2">{t`[circular]`}</span>
        ) : (
          <Scalar value={value} bytes={ctx.bytes} />
        )}
      </li>
    )
  }
  return (
    <Branch
      name={name}
      indexed={indexed}
      value={value}
      entries={entries}
      depth={depth}
      ancestors={ancestors}
      ctx={ctx}
    />
  )
}

function Branch({
  name,
  indexed,
  value,
  entries,
  depth,
  ancestors,
  ctx,
}: {
  name?: string
  indexed: boolean
  value: unknown
  entries: Entry[]
  depth: number
  ancestors: readonly object[]
  ctx: Ctx
}) {
  const [open, setOpen] = useState(depth < ctx.openDepth)
  const [shown, setShown] = useState(SHOWN_STEP)
  const isArray = Array.isArray(value)
  const [opener, closer] = isArray ? ['[', ']'] : ['{', '}']
  const childAncestors = [...ancestors, value as object]
  const hidden = entries.length - shown
  const step = Math.min(SHOWN_STEP, hidden)
  return (
    <li className="py-px">
      <button
        type="button"
        aria-expanded={open}
        className="inline-flex min-h-6 max-w-full cursor-pointer items-start gap-1 rounded-1 border-0 bg-transparent p-0 text-start font-[inherit] leading-6 text-inherit hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--dh-focus)]"
        onClick={() => {
          setOpen((o) => !o)
        }}
      >
        <span className="inline-flex h-6 w-[18px] items-center justify-center text-ink-2">
          <Icon name="chevron" size="sm" className={cx(!open && '-rotate-90')} />
        </span>
        <span className="min-w-0 break-all">
          <KeyLabel name={name} indexed={indexed} />
          <span className="text-ink-2">{opener}</span>
          {open ? null : (
            <span className="text-ink-2">
              {entries.length > 0 ? ` ${countText(value, entries.length)} ` : ''}
              {closer}
            </span>
          )}
          {open && entries.length === 0 ? <span className="text-ink-2">{closer}</span> : null}
        </span>
      </button>
      {open && entries.length > 0 ? (
        <>
          <ul className="m-0 ml-[9px] list-none border-l border-line p-0 pl-[13px]">
            {entries.slice(0, shown).map(([key, child]) => (
              <Row
                key={key}
                name={key}
                indexed={isArray}
                value={child}
                depth={depth + 1}
                ancestors={childAncestors}
                ctx={ctx}
              />
            ))}
            {entries.length > shown ? (
              <li className="py-px pl-[22px]">
                <button
                  type="button"
                  className="dh-btn dh-btn--link"
                  onClick={() => {
                    setShown((n) => n + SHOWN_STEP)
                  }}
                >
                  {t`Show ${step} more of ${hidden}`}
                </button>
              </li>
            ) : null}
          </ul>
          <span className="block pl-[22px] leading-6 text-ink-2">{closer}</span>
        </>
      ) : null}
    </li>
  )
}

export function JsonView({
  value,
  collapsedDepth = 1,
  copy = true,
  maxHeight,
  bytes = 'hex',
  label,
}: JsonViewProps) {
  const [openDepth, setOpenDepth] = useState(collapsedDepth)
  const [generation, setGeneration] = useState(0)
  const tree: ReactNode = (
    <ul
      key={generation}
      className="m-0 list-none p-0"
      aria-label={maxHeight === undefined ? (label ?? t`JSON`) : undefined}
    >
      <Row indexed={false} value={value} depth={0} ancestors={[]} ctx={{ bytes, openDepth }} />
    </ul>
  )
  const branching = entriesOf(value) !== null
  const setAll = (depth: number) => {
    setOpenDepth(depth)
    setGeneration((g) => g + 1)
  }
  return (
    <div className="rx-mono rounded-2 border border-line bg-sunken text-[13px]" data-json-view>
      {copy || branching ? (
        <div className="flex flex-wrap items-center justify-end gap-x-3 border-b border-line px-2 py-1">
          {branching ? (
            <>
              <button
                type="button"
                className="dh-btn dh-btn--link min-h-6"
                onClick={() => {
                  setAll(Infinity)
                }}
              >
                {t`Expand all`}
              </button>
              <button
                type="button"
                className="dh-btn dh-btn--link min-h-6"
                onClick={() => {
                  setAll(1)
                }}
              >
                {t`Collapse all`}
              </button>
            </>
          ) : null}
          {copy ? <Copy value={jsonText(value, bytes)} label={t`Copy JSON`} /> : null}
        </div>
      ) : null}
      <div
        className="overflow-auto p-2"
        style={maxHeight === undefined ? undefined : { maxHeight }}
        tabIndex={maxHeight === undefined ? undefined : 0}
        role={maxHeight === undefined ? undefined : 'region'}
        aria-label={maxHeight === undefined ? undefined : (label ?? t`JSON`)}
      >
        {tree}
      </div>
    </div>
  )
}
