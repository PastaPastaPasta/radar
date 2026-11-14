import type { ReactNode } from 'react'
import type { Layer } from '@/ui'
import { SectionSources, SourceSection } from '@/ui/layout'
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
  /** One sentence under the title. The page's one source line follows it: it names what the page shows outside its sections. */
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
    <SourceSection>
      <article data-page={path} data-layer={layer} className="rx-page">
        <header className="rx-page__head">
          <p data-eyebrow className="rx-page__eyebrow">
            {eyebrow}
            {net === 'mainnet' ? null : ` · ${networkName(net)}`}
          </p>
          <div className="rx-page__title">
            <h1>{title}</h1>
            {share ? (
              <div className="rx-page__actions">
                {actions}
                <CopyLinkButton />
              </div>
            ) : (
              actions
            )}
          </div>
          {lede ? <p className="rx-page__lede">{lede}</p> : null}
          <SectionSources className="rx-page__src" />
        </header>
        {children}
      </article>
    </SourceSection>
  )
}
