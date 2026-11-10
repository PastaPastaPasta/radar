import type { ReactNode } from 'react'
import { useDocumentTitle, useNetwork, networkName } from '@/features/entity'

export interface PageFrameProps {
  /** The route id pattern, for `data-page`. */
  path: string
  title: string
  eyebrow?: string
  /** One sentence under the title. */
  lede?: ReactNode
  actions?: ReactNode
  children: ReactNode
}

export function PageFrame({
  path,
  title,
  eyebrow = 'Core',
  lede,
  actions,
  children,
}: PageFrameProps) {
  const net = useNetwork()
  useDocumentTitle(title)
  return (
    <article data-page={path} data-layer="core" className="grid gap-6">
      <header className="grid gap-2">
        <p data-eyebrow className="text-sm text-[var(--dh-ink-2,inherit)]">
          {eyebrow}
          {net === 'mainnet' ? null : ` · ${networkName(net)}`}
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-semibold">{title}</h1>
          {actions}
        </div>
        {lede ? <p className="text-[var(--dh-ink-2,inherit)]">{lede}</p> : null}
      </header>
      {children}
    </article>
  )
}
