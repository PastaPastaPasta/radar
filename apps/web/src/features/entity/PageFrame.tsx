import type { ReactNode } from 'react'
import type { Layer } from '@/ui'
import { CopyLinkButton } from './CopyLinkButton'
import { useDocumentTitle } from './document-title'
import { networkName, useNetwork } from './network'

export interface PageFrameProps {
  /** The route id pattern, for `data-page`. */
  path: string
  title: string
  eyebrow?: string
  /** The layer the page belongs to; it colors the page's accents. */
  layer?: Layer
  /** One sentence under the title. */
  lede?: ReactNode
  actions?: ReactNode
  /** Adds the copy-link button beside `actions`; every page about one entity sets it. */
  share?: boolean
  children: ReactNode
}

export function PageFrame({
  path,
  title,
  eyebrow = 'Core',
  layer = 'core',
  lede,
  actions,
  share = false,
  children,
}: PageFrameProps) {
  const net = useNetwork()
  useDocumentTitle(title)
  return (
    <article data-page={path} data-layer={layer} className="grid gap-6">
      <header className="grid gap-2">
        <p data-eyebrow className="text-sm text-[var(--dh-ink-2,inherit)]">
          {eyebrow}
          {net === 'mainnet' ? null : ` · ${networkName(net)}`}
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-semibold">{title}</h1>
          {share ? (
            <div className="flex flex-wrap items-center gap-2">
              {actions}
              <CopyLinkButton />
            </div>
          ) : (
            actions
          )}
        </div>
        {lede ? <p className="text-[var(--dh-ink-2,inherit)]">{lede}</p> : null}
      </header>
      {children}
    </article>
  )
}
