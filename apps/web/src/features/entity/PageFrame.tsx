import { createContext, useContext, useEffect, useState, type Context, type ReactNode } from 'react'
import type { Layer } from '@/ui'
import { SectionSources, SourceSection } from '@/ui/layout'
import { CopyLinkButton } from './CopyLinkButton'
import { useDocumentTitle } from './document-title'
import { networkName, useNetwork } from './network'
import { findPage, sectionLabel } from './site-map'

export interface PageFrameProps {
  /** The route id pattern, for `data-page`. */
  path: string
  /** The page's name: the document title, and the headline until `claim` is there. */
  title: string
  /**
   * What the page has to say right now, as its headline: one specific sentence built from live data ("2,581 Dash
   * nodes answered the last crawl"). Leave it out while the data is on its way or its source is down: the headline
   * is then the page's name, never an empty line or a skeleton.
   */
  claim?: ReactNode
  /** Where the page sits, when the section rail does not already say it: a parent page. The section's own name is not drawn. */
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

type ReportClaim = (claim: string | undefined) => void

// Made on first use, not at load: a module that does work when it loads is bundled into the entry chunk through the
// feature barrel, and only pages need this one.
let claimContext: Context<ReportClaim | null> | undefined
const claims = () => (claimContext ??= createContext<ReportClaim | null>(null))

/**
 * Lets the part of a page that reads the data say the page's claim, where the page itself does not hold that read.
 * A string, so an unchanged claim never re-renders the head. Outside a `PageFrame` it does nothing.
 */
export function usePageClaim(claim: string | undefined): void {
  const report = useContext(claims())
  useEffect(() => {
    if (!report) return
    report(claim)
    return () => {
      report(undefined)
    }
  }, [report, claim])
}

export function PageFrame({
  path,
  title,
  claim,
  eyebrow,
  layer = 'core',
  lede,
  actions,
  share = false,
  children,
}: PageFrameProps) {
  const net = useNetwork()
  useDocumentTitle(title)
  const page = findPage(path)
  // The rail above the page names its section, and the header names the network.
  const above = eyebrow && (!page || eyebrow !== sectionLabel(page.section)) ? eyebrow : undefined
  const [reported, setReported] = useState<string>()
  const given = claim === undefined || claim === null || claim === false ? reported : claim
  const headline = given === '' ? undefined : given
  const Claims = claims()
  return (
    <Claims.Provider value={setReported}>
      <SourceSection>
        <article data-page={path} data-layer={layer} data-source-scope="" className="rx-page">
          <header className="rx-page__head">
            {above ? (
              <p data-eyebrow className="rx-page__eyebrow">
                {above}
                {net === 'mainnet' ? null : ` · ${networkName(net)}`}
              </p>
            ) : null}
            <div className="rx-page__title">
              <h1 data-claim={headline === undefined ? undefined : ''}>{headline ?? title}</h1>
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
    </Claims.Provider>
  )
}
