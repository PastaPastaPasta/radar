import { useLingui } from '@lingui/react/macro'
import type { ReactNode } from 'react'
import type { SourceStamp } from '@/data/envelope'
import { CopyLinkButton, useDocumentTitle, networkName, PageLink } from '@/features/entity'
import { type NetworkId } from '@/lib/network'
import { Empty, LayerTile, Skeleton, SourceLine, type IconName } from '@/ui'

interface Crumb {
  label: ReactNode
  to?: ReactNode
}

/** The Core page band: breadcrumbs, then the record header and KPI row. The Core page links live in the shell's section bar. */
export function CoreBand({ crumbs, children }: { crumbs: Crumb[]; children: ReactNode }) {
  const { t } = useLingui()
  return (
    <section className="rx-band" data-layer="core" aria-labelledby="h-page">
      <div className="dh-container">
        <ol className="rx-crumbs" aria-label={t`Where this is`}>
          {crumbs.map((c, i) => (
            <li key={i} aria-current={c.to ? undefined : 'page'}>
              {c.to ?? c.label}
            </li>
          ))}
        </ol>
        {children}
      </div>
    </section>
  )
}

export function CoreBandSkeleton() {
  return (
    <CoreBand crumbs={[]}>
      <div className="rx-rec" aria-busy="true">
        <h1 className="rx-rec__title" id="h-page">
          <Skeleton shape="line" width="40%" />
        </h1>
      </div>
      <div className="rx-kpis">
        <Skeleton shape="stat" count={4} />
      </div>
    </CoreBand>
  )
}

export function RecordHeader({
  icon,
  kicker,
  title,
  actions,
  share = false,
  meta,
  children,
}: {
  icon: IconName
  kicker: ReactNode
  title: ReactNode
  actions?: ReactNode
  /** Adds the copy-link control to the actions. */
  share?: boolean
  meta?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="rx-rec">
      <span className="rx-rec__glyph">
        <LayerTile layer="core" icon={icon} size={60} />
      </span>
      <p className="rx-rec__kicker">{kicker}</p>
      <h1 className="rx-rec__title" id="h-page">
        {title}
      </h1>
      {actions || share ? (
        <div className="rx-rec__actions">
          {actions}
          {share ? <CopyLinkButton /> : null}
        </div>
      ) : null}
      {meta}
      {children}
    </div>
  )
}

interface SectionLink {
  id: string
  label: ReactNode
}

/** Phone-only row of in-page anchors for a long record page; the stylesheet hides it above 640 px. */
export function SectionIndex({ sections }: { sections: SectionLink[] }) {
  const { t } = useLingui()
  return (
    <nav className="rx-secindex" aria-label={t`On this page`}>
      {sections.map((s) => (
        <a key={s.id} href={`#${s.id}`}>
          {s.label}
        </a>
      ))}
    </nav>
  )
}

export function Section({
  id,
  title,
  description,
  actions,
  source,
  children,
}: {
  id: string
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  source?: SourceStamp | SourceStamp[]
  children: ReactNode
}) {
  return (
    <section className="rx-sec" data-layer="core" id={id} aria-labelledby={`${id}-h`}>
      <div className="rx-sec__head">
        <h2 className="rx-sec__title" id={`${id}-h`}>
          {title}
        </h2>
        {description ? <p className="rx-sec__desc">{description}</p> : null}
        {actions || source ? (
          <div className="rx-sec__actions">
            {actions}
            {source ? <SourceLine stamp={source} compact /> : null}
          </div>
        ) : null}
      </div>
      {children}
    </section>
  )
}

export function Page({ title, children }: { title: string; children: ReactNode }) {
  useDocumentTitle(title)
  return <div data-page-body>{children}</div>
}

const OTHER: Record<'mainnet' | 'testnet', 'mainnet' | 'testnet'> = {
  mainnet: 'testnet',
  testnet: 'mainnet',
}

/** What to say when a block or transaction isn't on this network, with the other network offered when the input's shape fits it. */
export function NotFound({
  title,
  what,
  path,
  net,
}: {
  /** The page's own name, as its heading. */
  title: string
  what: ReactNode
  /** Path of this record, for the other network's link. */
  path: string
  net: NetworkId
}) {
  const { t } = useLingui()
  const other = net === 'mainnet' || net === 'testnet' ? OTHER[net] : undefined
  return (
    <div className="dh-container" style={{ paddingBlock: '48px 80px' }}>
      <h1 className="sr-only">{title}</h1>
      <Empty
        kind="not-found"
        title={t`Not found on ${networkName(net)}`}
        body={what}
        action={
          other ? (
            <PageLink to={path} search={{ network: other }} className="dh-btn">
              {t`Search ${networkName(other)}`}
            </PageLink>
          ) : null
        }
      />
    </div>
  )
}
