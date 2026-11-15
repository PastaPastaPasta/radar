import { useLingui } from '@lingui/react/macro'
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type Context,
  type ReactNode,
} from 'react'
import { labelsVersion, subscribeLabels, wellKnownLabel } from '@/lib/well-known'
import type { EntityKind, Layer } from '@/ui'
import { Identicon, LayerTile } from '@/ui/art'
import { Hash } from '@/ui/hash'
import { KIND_META } from '@/ui/kinds'
import { SectionSources, SourceSection } from '@/ui/layout'
import { CopyLinkButton } from './CopyLinkButton'
import { useDocumentTitle } from './document-title'
import { networkName, useNetwork } from './network'
import { findPage, sectionLabel } from './site-map'

/**
 * What a page about one entity says of it. The page then opens with the record header: a band in the layer's tint,
 * the entity's identicon or kind glyph, a headline that names it, its ID, and its key facts.
 */
export interface PageRecord {
  kind: EntityKind
  /** The entity's ID, shown in full under the headline. A name page has none. */
  id?: string | undefined
  /** The entity's own name (a DPNS name, a contract's or token's name), once it is known. */
  name?: string | undefined
  /** The word the headline starts with while the entity has no name; the kind's label when left out. */
  noun?: string
  /** Two to four `Stat`s: the figures a reader came for. */
  facts?: ReactNode
}

const shortId = (id: string): string => (id.length > 16 ? `${id.slice(0, 8)}…${id.slice(-6)}` : id)

/**
 * The name a record goes by: the reader's own label for it (Settings › Your own names) or a well-known one first,
 * then the entity's name, then its kind and short ID. Never empty.
 */
export function useRecordTitle(record: PageRecord | undefined, fallback: string): string {
  const { i18n } = useLingui()
  const net = useNetwork()
  useSyncExternalStore(subscribeLabels, labelsVersion, labelsVersion)
  if (!record) return fallback
  const own = record.id === undefined ? undefined : wellKnownLabel(net, record.kind, record.id)
  const named = own ?? record.name
  if (named !== undefined && named !== '') return named
  if (record.id === undefined) return fallback
  return `${record.noun ?? i18n._(KIND_META[record.kind].label)} ${shortId(record.id)}`
}

/** A DPNS name with its `.dash` set back, as every name chip draws it. */
function RecordName({ title }: { title: string }) {
  const dot = title.lastIndexOf('.')
  if (dot <= 0 || title.slice(dot) !== '.dash') return <>{title}</>
  return (
    <>
      {title.slice(0, dot)}
      <span className="rx-tld">{title.slice(dot)}</span>
    </>
  )
}

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
  /** The entity this page is about. The page then opens with the record header, and its title names the entity. */
  record?: PageRecord
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
  record,
  children,
}: PageFrameProps) {
  const { i18n } = useLingui()
  const net = useNetwork()
  const name = useRecordTitle(record, title)
  useDocumentTitle(name)
  const page = findPage(path)
  // The rail above the page names its section, and the header names the network.
  const above = eyebrow && (!page || eyebrow !== sectionLabel(page.section)) ? eyebrow : undefined
  const [reported, setReported] = useState<string>()
  const given = claim === undefined || claim === null || claim === false ? reported : claim
  const headline = given === '' ? undefined : given
  const Claims = claims()
  const tools =
    share || actions ? (
      <>
        {actions}
        {share ? <CopyLinkButton /> : null}
      </>
    ) : null
  const kind = record ? KIND_META[record.kind] : undefined
  const netSuffix = net === 'mainnet' ? null : ` · ${networkName(net)}`
  return (
    <Claims.Provider value={setReported}>
      <SourceSection>
        <article
          data-page={path}
          data-layer={layer}
          data-source-scope=""
          className={record ? 'rx-page rx-page--record' : 'rx-page'}
        >
          {record && kind ? (
            <header className="rx-band rx-page__band" data-layer={layer} data-record={record.kind}>
              <div className="dh-container">
                <div className="rx-rec">
                  <span className="rx-rec__glyph">
                    {record.kind === 'identity' && record.id !== undefined ? (
                      <span className="rx-rec__face">
                        <Identicon id={record.id} size={40} />
                      </span>
                    ) : (
                      <LayerTile layer={layer} icon={kind.icon} size={60} />
                    )}
                  </span>
                  <p className="rx-rec__kicker" data-record-kind>
                    <span className="rx-rec__kind">{i18n._(kind.label)}</span>
                    {netSuffix}
                  </p>
                  <h1
                    className="rx-rec__title"
                    data-claim={headline === undefined ? undefined : ''}
                  >
                    {headline ?? <RecordName title={name} />}
                  </h1>
                  {tools ? <div className="rx-rec__actions">{tools}</div> : null}
                  {record.id !== undefined ? (
                    <div className="rx-rec__meta" data-record-id>
                      <Hash value={record.id} display="wrap" />
                    </div>
                  ) : null}
                  {lede ? <p className="rx-rec__also">{lede}</p> : null}
                  <SectionSources className="rx-rec__src rx-page__src" />
                </div>
                {record.facts ? (
                  <div className="rx-kpis" data-record-facts>
                    {record.facts}
                  </div>
                ) : null}
              </div>
            </header>
          ) : (
            <header className="rx-page__head">
              {above ? (
                <p data-eyebrow className="rx-page__eyebrow">
                  {above}
                  {netSuffix}
                </p>
              ) : null}
              <div className="rx-page__title">
                <h1 data-claim={headline === undefined ? undefined : ''}>{headline ?? title}</h1>
                {share ? <div className="rx-page__actions">{tools}</div> : actions}
              </div>
              {lede ? <p className="rx-page__lede">{lede}</p> : null}
              <SectionSources className="rx-page__src" />
            </header>
          )}
          {children}
        </article>
      </SourceSection>
    </Claims.Provider>
  )
}
