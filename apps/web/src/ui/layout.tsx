import { t } from '@lingui/core/macro'
import { useId, useMemo, type ReactNode } from 'react'
import type { SourceStamp } from '@/data/envelope'
import { useAllSourceHealth } from '@/data/health'
import { clampSkew, formatRelative } from '@/lib/format'
import { announce } from './announce'
import { copyText } from './clipboard'
import { cx, layerAttr } from './cx'
import { Icon } from './icon'
import { useNow } from './hooks'
import { sourceName } from './source-labels'
import {
  reportsAttr,
  SourceSectionProvider,
  stampsOfInput,
  useSectionCovers,
  useSectionLine,
  useSectionSource,
  useSourceCollector,
  type SourceInput,
} from './section-source'
import { SourceScope, sourceKey, useCovered, useCoveredSource } from './source-scope'
import { Empty, ErrorState, Skeleton, SourceLine } from './states'
import type { Layer, LoadState } from './types'

function AnchorLink({ id }: { id: string }) {
  return (
    <button
      type="button"
      className="rx-sec__copy"
      aria-label={t`Copy link to this section`}
      onClick={() => {
        const url = `${location.origin}${location.pathname}${location.search}#${id}`
        void copyText(url).then((ok) => {
          if (ok) announce(t`Link copied`)
        })
      }}
    >
      <Icon name="link" size="sm" />
    </button>
  )
}

export interface CardProps {
  title?: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  layer?: Layer
  source?: SourceStamp | SourceStamp[]
  state?: LoadState
  error?: unknown
  onRetry?: () => void
  id?: string
  /**
   * `section` gives the card a section's look: a ruled head and its subtitle as one sentence under it. Either way its
   * sources go to the line of the section or page around it; a kit `Section` is what starts a new line.
   */
  level?: 'block' | 'section'
  ground?: Ground
  className?: string
  children: ReactNode
}

/**
 * The ground a block of a page stands on. Blocks of a page alternate between the page ground and a raised band on
 * their own; `band` and `page` fix one, and `layer` puts a block about another layer than its page on that layer's
 * ground.
 */
export type Ground = 'page' | 'band' | 'layer'

const nameOf = (label: ReactNode): string | undefined =>
  typeof label === 'string' && label !== '' ? label : undefined

function useCardSource(source: CardProps['source'], title: ReactNode) {
  const health = useAllSourceHealth()
  const outer = useCovered()
  const all = stampsOfInput(source)
  const inSection = useSectionSource(all, nameOf(title))
  const down = all.find((s) => health.find((h) => h.source === s.source)?.state === 'down')
  // A section names its sources in its own line, so a card inside one carries no mark; a card that stands alone does.
  const stamps = inSection ? [] : all.filter((s) => !outer.has(sourceKey(s)))
  return { all, stamps, down, reports: inSection ? reportsAttr(all) : undefined }
}

function present(node: ReactNode): boolean {
  return node !== undefined && node !== null && node !== false && node !== ''
}

export function Card({
  title,
  subtitle,
  actions,
  layer,
  source,
  state = 'ready',
  error,
  onRetry,
  id,
  level = 'block',
  ground,
  className,
  children,
}: CardProps) {
  const isSection = level === 'section'
  const { all, stamps, down, reports } = useCardSource(source, title)
  const keys = all.map(sourceKey).join(',')
  const covered = useMemo(() => new Set(keys.split(',')), [keys])
  const now = useNow(down !== undefined)
  const hasHead = [title, actions, subtitle].some(present) || stamps.length > 0
  const attr = layerAttr(layer)
  const head = isSection ? (
    <>
      <div className="rx-sec__head">
        {title ? <h2 className="rx-sec__title">{title}</h2> : null}
        {id ? <AnchorLink id={id} /> : null}
        {actions ? <div className="rx-sec__actions">{actions}</div> : null}
      </div>
      {subtitle ? <p className="rx-sec__lede">{subtitle}</p> : null}
      {stamps.length > 0 ? (
        <p className="rx-sec__src">
          <SourceLine stamp={stamps} compact />
        </p>
      ) : null}
    </>
  ) : hasHead ? (
    <div className="rx-card__head">
      {title ? (
        <h3 className="rx-card__title">
          {title}
          {id ? <AnchorLink id={id} /> : null}
        </h3>
      ) : null}
      {subtitle ? <p className="rx-card__sub">{subtitle}</p> : null}
      {actions || stamps.length > 0 ? (
        <div className="rx-card__aside">
          {actions}
          {stamps.length > 0 ? <SourceLine stamp={stamps} compact /> : null}
        </div>
      ) : null}
    </div>
  ) : null
  return (
    <section
      id={id}
      className={cx('rx-card', isSection && 'rx-sec rx-sec--ruled', down && 'rx-down', className)}
      data-layer={attr}
      data-ground={ground}
      data-state={state}
      data-reports={reports}
      aria-busy={state === 'loading' || undefined}
    >
      {head}
      {down ? (
        <p className="rx-down__msg" role="status">
          <Icon name="alert" />
          <span>
            {t`${sourceName(down.source)} isn't answering · showing data from ${formatRelative(clampSkew(down.fetchedAt, now), now)}`}
          </span>
          {onRetry ? (
            <button type="button" className="dh-btn dh-btn--sm" onClick={onRetry}>
              {t`Retry`}
            </button>
          ) : null}
        </p>
      ) : null}
      {state === 'loading' ? (
        <div className="rx-card__body">
          <Skeleton shape="line" count={5} />
        </div>
      ) : state === 'error' ? (
        <ErrorState error={error} source={all[0]?.source} onRetry={onRetry} />
      ) : state === 'empty' ? (
        <Empty kind="none-yet" title={t`Nothing to show`} />
      ) : (
        <div className="rx-card__body">
          <SourceScope value={covered}>{children}</SourceScope>
        </div>
      )}
    </section>
  )
}

export interface SectionBandProps {
  layer: Layer
  title: ReactNode
  description?: ReactNode
  id?: string
  actions?: ReactNode
  children: ReactNode
}

export function SectionBand({
  layer,
  title,
  description,
  id,
  actions,
  children,
}: SectionBandProps) {
  const attr = layerAttr(layer)
  const headingId = id ? `${id}-title` : undefined
  return (
    <section id={id} className="rx-zone" data-layer={attr} aria-labelledby={headingId}>
      <div className="dh-container">
        <div className="rx-sec">
          <div className="rx-sec__head">
            <h2 className="rx-sec__title" id={headingId}>
              {title}
            </h2>
            {description ? <p className="rx-sec__desc">{description}</p> : null}
            {id ? <AnchorLink id={id} /> : null}
            {actions ? <div className="rx-sec__actions">{actions}</div> : null}
          </div>
          {children}
        </div>
      </div>
    </section>
  )
}

/**
 * A stretch of a page that says where its figures came from once. `source` names the stamps the page read itself;
 * cards, stats, tables and key-value rows inside hand theirs up instead of drawing their own marks. `SectionSources`
 * draws the line wherever the section wants it. The element that wraps the section carries `data-source-scope`, so a
 * part's line can be found from the part.
 */
export function SourceSection({ source, children }: { source?: SourceInput; children: ReactNode }) {
  const { collector, line, covers } = useSourceCollector(source)
  return (
    <SourceSectionProvider collector={collector} line={line} covers={covers}>
      {children}
    </SourceSectionProvider>
  )
}

/** The enclosing section's one source line. It keeps its height while empty, so the first answer does not move the page. */
export function SectionSources({ className }: { className?: string }) {
  const line = useSectionLine()
  const covers = useSectionCovers()
  return (
    <p className={cx('rx-sec__src', className)} data-section-sources>
      {line.length > 0 ? <SourceLine stamp={[...line]} compact covers={covers} /> : null}
    </p>
  )
}

export interface SectionProps {
  title: ReactNode
  /** One sentence under the title. */
  lede?: ReactNode
  id?: string
  actions?: ReactNode
  layer?: Layer
  /** The stamps the section read itself. What its cards, stats and tables show is added without being listed here. */
  source?: SourceInput
  ground?: Ground
  className?: string
  children: ReactNode
}

/**
 * A page section: a ruled head, one sentence, one source line for everything in it, then its
 * content. Nothing inside repeats a source the line names.
 */
export function Section({
  title,
  lede,
  id,
  actions,
  layer,
  source,
  ground,
  className,
  children,
}: SectionProps) {
  const autoId = useId()
  const headingId = id ? `${id}-title` : autoId
  return (
    <SourceSection source={source}>
      <section
        id={id}
        className={cx('rx-sec rx-sec--ruled', className)}
        data-layer={layerAttr(layer)}
        data-ground={ground}
        data-source-scope=""
        aria-labelledby={headingId}
      >
        <div className="rx-sec__head">
          <h2 className="rx-sec__title" id={headingId}>
            {title}
          </h2>
          {id ? <AnchorLink id={id} /> : null}
          {actions ? <div className="rx-sec__actions">{actions}</div> : null}
        </div>
        {lede ? <p className="rx-sec__lede">{lede}</p> : null}
        <SectionSources />
        <div className="rx-sec__body">{children}</div>
      </section>
    </SourceSection>
  )
}

export interface KeyValueProps {
  items: { label: ReactNode; value: ReactNode; source?: SourceStamp; hint?: ReactNode }[]
  columns?: 1 | 2 | 3
}

function KvRow({ item }: { item: KeyValueProps['items'][number] }) {
  const inSection = useSectionSource(item.source, nameOf(item.label))
  const covered = useCoveredSource(item.source) || inSection
  const srcId = useId()
  // The section's line names a source once. A proof-checked figure also keeps its own mark within reach of a
  // pointer, the keyboard and a tap, since each proof is its own.
  const own = inSection && item.source?.proved === true ? item.source : undefined
  return (
    <div data-reports={inSection && item.source ? reportsAttr([item.source]) : undefined}>
      <dt>{item.label}</dt>
      <dd {...(own ? { 'data-src-hover': '', tabIndex: 0, 'aria-describedby': srcId } : {})}>
        {item.value}
        {item.source && !covered ? (
          <>
            {' '}
            <SourceLine stamp={item.source} compact />
          </>
        ) : null}
        {item.hint ? <span className="rx-kv__hint">{item.hint}</span> : null}
        {own ? (
          <span className="rx-fig__src" id={srcId}>
            <SourceLine stamp={own} compact />
          </span>
        ) : null}
      </dd>
    </div>
  )
}

export function KeyValue({ items, columns = 1 }: KeyValueProps) {
  if (columns === 1) {
    return (
      <dl className="dh-kv dh-kv--ruled rx-kv">
        {items.map((item, i) => (
          <KvRow key={i} item={item} />
        ))}
      </dl>
    )
  }
  return (
    <div className="rx-kvgrid" data-columns={columns}>
      {items.map((item, i) => (
        <dl key={i} className="dh-kv dh-kv--ruled rx-kv">
          <KvRow item={item} />
        </dl>
      ))}
    </div>
  )
}
