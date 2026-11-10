import type { ReactNode } from 'react'
import type { SourceStamp } from '@/data/envelope'
import { useAllSourceHealth } from '@/data/health'
import { clampSkew, formatRelative } from '@/lib/format'
import { announce } from './announce'
import { LayerTile } from './art'
import { copyText } from './clipboard'
import { cx, layerAttr } from './cx'
import { Icon } from './icon'
import { useNow } from './hooks'
import { SOURCE_NAME } from './source-labels'
import { Empty, ErrorState, Skeleton, SourceLine } from './states'
import type { Layer, LoadState } from './types'

const LAYER_ICON = { core: 'block', platform: 'plat', network: 'node', neutral: 'radar' } as const

function AnchorLink({ id }: { id: string }) {
  return (
    <button
      type="button"
      className="rx-sec__copy"
      aria-label="Copy link to this section"
      onClick={() => {
        const url = `${location.origin}${location.pathname}${location.search}#${id}`
        void copyText(url).then((ok) => {
          if (ok) announce('Link copied')
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
  padding?: 'normal' | 'flush'
  className?: string
  children: ReactNode
}

function useCardSource(source: CardProps['source']) {
  const health = useAllSourceHealth()
  const stamps = source === undefined ? [] : Array.isArray(source) ? source : [source]
  const down = stamps.find((s) => health.find((h) => h.source === s.source)?.state === 'down')
  const stale = stamps
    .map((s) => health.find((h) => h.source === s.source))
    .find((h) => h?.state === 'stale' && h.lag)
  return { stamps, down, lag: stale?.lag?.detail }
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
  padding = 'normal',
  className,
  children,
}: CardProps) {
  const { stamps, down, lag } = useCardSource(source)
  const now = useNow(down !== undefined)
  const hasHead = [title, actions, subtitle].some(present) || stamps.length > 0
  const attr = layerAttr(layer)
  return (
    <section
      id={id}
      className={cx('rx-card', down && 'rx-down', className)}
      data-layer={attr}
      data-state={state}
      data-padding={padding}
      aria-busy={state === 'loading' || undefined}
    >
      {hasHead ? (
        <div className="rx-card__head">
          {title ? (
            <h3 className="rx-card__title">
              {attr ? (
                <LayerTile layer={layer ?? 'neutral'} icon={LAYER_ICON[attr]} size={26} />
              ) : null}
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
      ) : null}
      {down ? (
        <p className="rx-down__msg" role="status">
          <Icon name="alert" />
          <span>
            {SOURCE_NAME[down.source]} isn't answering · showing data from{' '}
            {formatRelative(clampSkew(down.fetchedAt, now), now)}
          </span>
          {onRetry ? (
            <button type="button" className="dh-btn dh-btn--sm" onClick={onRetry}>
              Retry
            </button>
          ) : null}
        </p>
      ) : lag ? (
        <p className="rx-card__lag">{lag}</p>
      ) : null}
      {state === 'loading' ? (
        <div className="rx-card__body">
          <Skeleton shape="line" count={5} />
        </div>
      ) : state === 'error' ? (
        <ErrorState error={error} source={stamps[0]?.source} onRetry={onRetry} />
      ) : state === 'empty' ? (
        <Empty kind="none-yet" title="Nothing to show" />
      ) : (
        <div className={cx('rx-card__body', padding === 'flush' && 'rx-card__body--flush')}>
          {children}
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

export interface KeyValueProps {
  items: { label: ReactNode; value: ReactNode; source?: SourceStamp; hint?: ReactNode }[]
  columns?: 1 | 2 | 3
}

function KvRow({ item }: { item: KeyValueProps['items'][number] }) {
  return (
    <div>
      <dt>{item.label}</dt>
      <dd>
        {item.value}
        {item.source ? (
          <>
            {' '}
            <SourceLine stamp={item.source} compact />
          </>
        ) : null}
        {item.hint ? <span className="rx-kv__hint">{item.hint}</span> : null}
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
