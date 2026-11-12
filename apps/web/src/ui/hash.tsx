import { t } from '@lingui/core/macro'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { announce } from './announce'
import { copyText } from './clipboard'
import { cx } from './cx'
import { useMediaQuery } from './hooks'
import { Icon } from './icon'

export interface CopyProps {
  value: string
  label?: string
}

const COPIED_MS = 1400

export function Copy({ value, label }: CopyProps) {
  const [done, setDone] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  return (
    <button
      type="button"
      className={cx('rx-copy', done && 'is-done')}
      aria-label={label ?? t`Copy`}
      data-copy={value}
      onClick={() => {
        void copyText(value).then((ok) => {
          if (!ok) return
          setDone(true)
          announce(t`Copied`)
          window.clearTimeout(timer.current)
          timer.current = window.setTimeout(() => {
            setDone(false)
          }, COPIED_MS)
        })
      }}
    >
      <Icon name={done ? 'check' : 'copy'} />
    </button>
  )
}

export interface HashProps {
  value: string
  display?: 'short' | 'full' | 'wrap'
  head?: number
  tail?: number
  copy?: boolean
  /** On a phone, a `wrap` hash is cut in the middle (the full value stays in the title and the copy button). */
  phoneShort?: boolean
}

const PHONE = '(max-width: 640px)'

export function shortHash(
  value: string,
  head = 6,
  tail = 4,
): { head: string; tail: string } | null {
  return value.length > head + tail + 1
    ? { head: value.slice(0, head), tail: value.slice(-tail) }
    : null
}

export function ShortText({ short }: { short: { head: string; tail: string } }) {
  return (
    <>
      {short.head}
      <span className="rx-ell">…</span>
      {short.tail}
    </>
  )
}

export function Hash({
  value,
  display = 'short',
  head,
  tail,
  copy = true,
  phoneShort = false,
}: HashProps) {
  const phone = useMediaQuery(PHONE)
  const [open, setOpen] = useState(false)
  const toggles = display === 'wrap' && phoneShort && phone
  const cut = display === 'short' || (toggles && !open)
  const short = cut
    ? shortHash(value, head ?? (display === 'short' ? 6 : 8), tail ?? (display === 'short' ? 4 : 6))
    : null
  let text: ReactNode
  if (short) {
    text = <ShortText short={short} />
  } else if (display === 'short' || value.length <= 8) {
    text = value
  } else {
    text = (
      <>
        <b>{value.slice(0, 4)}</b>
        {value.slice(4, -2)}
        <b>{value.slice(-2)}</b>
      </>
    )
  }
  return (
    <span className="rx-hash" data-display={display}>
      <code
        className={cx(
          display === 'short' || short ? 'rx-mono' : 'rx-hash-full',
          display === 'wrap' && !short && 'is-wrap',
        )}
        title={short ? value : undefined}
      >
        {toggles ? (
          <button
            type="button"
            className="rx-hash-toggle"
            aria-expanded={open}
            onClick={() => {
              setOpen((v) => !v)
            }}
          >
            {text}
          </button>
        ) : (
          text
        )}
      </code>
      {copy ? <Copy value={value} label={t`Copy full value`} /> : null}
    </span>
  )
}
