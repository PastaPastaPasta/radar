import { useLingui } from '@lingui/react/macro'
import type { ReactNode } from 'react'
import type { SourceStamp } from '@/data/envelope'
import { useDocumentTitle, networkName, PageLink, pagesInSection } from '@/features/entity'
import { type NetworkId } from '@/lib/network'
import { Empty, LayerTile, Skeleton, SourceLine, type IconName } from '@/ui'

export interface Crumb {
  label: ReactNode
  to?: ReactNode
}

/** The Core page band: the layer's sub-page links, breadcrumbs, then the record header and KPI row. */
export function CoreBand({
  crumbs,
  current,
  children,
}: {
  crumbs: Crumb[]
  current: string
  children: ReactNode
}) {
  const { t } = useLingui()
  return (
    <section className="rx-band" data-layer="core" aria-labelledby="h-page">
      <div className="dh-container">
        <nav className="rx-band__nav" aria-label={t`Core`}>
          {pagesInSection('core').map((p) => (
            <PageLink
              key={p.path}
              to={p.path}
              aria-current={p.path === current ? 'page' : undefined}
            >
              {p.title}
            </PageLink>
          ))}
        </nav>
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
    <CoreBand crumbs={[]} current="/blocks">
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
  meta,
  children,
}: {
  icon: IconName
  kicker: ReactNode
  title: ReactNode
  actions?: ReactNode
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
      {actions ? <div className="rx-rec__actions">{actions}</div> : null}
      {meta}
      {children}
    </div>
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
