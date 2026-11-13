import { useLingui } from '@lingui/react/macro'
import { useRouterState } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { announce, Icon } from '@/ui'
import { copyText } from '@/ui/clipboard'

const COPIED_MS = 1400

export interface CopyLinkButtonProps {
  /** The accessible name; defaults to "Copy link". */
  label?: string
}

/** Copies this page's address, which already names the network and the mode. */
export function CopyLinkButton({ label }: CopyLinkButtonProps) {
  const { t } = useLingui()
  const href = useRouterState({ select: (s) => s.location.href })
  const [done, setDone] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const name = label ?? t`Copy link`
  return (
    <button
      type="button"
      className="dh-btn dh-btn--sm"
      aria-label={name}
      title={name}
      data-copy-link
      onClick={() => {
        void copyText(new URL(href, window.location.origin).href).then((ok) => {
          if (!ok) return
          setDone(true)
          announce(t`Link copied`)
          window.clearTimeout(timer.current)
          timer.current = window.setTimeout(() => {
            setDone(false)
          }, COPIED_MS)
        })
      }}
    >
      <Icon name={done ? 'check' : 'link'} size="sm" />
    </button>
  )
}
