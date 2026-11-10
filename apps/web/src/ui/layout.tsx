import type { ReactNode } from 'react'
import type { SourceStamp } from '@/data/envelope'
import { Empty, ErrorState, Skeleton, SourceLine } from './states'
import type { Layer, LoadState } from './types'

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
  return (
    <section
      id={id}
      className={className}
      data-layer={layer}
      data-state={state}
      data-padding={padding}
    >
      {title || actions ? (
        <header>
          {title ? <h2>{title}</h2> : null}
          {subtitle ? <p>{subtitle}</p> : null}
          {actions}
        </header>
      ) : null}
      {state === 'loading' ? (
        <Skeleton shape="block" />
      ) : state === 'error' ? (
        <ErrorState error={error} onRetry={onRetry} />
      ) : state === 'empty' ? (
        <Empty kind="none-yet" title="Nothing to show" />
      ) : (
        children
      )}
      {source ? <SourceLine stamp={source} compact /> : null}
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
  return (
    <section id={id} data-layer={layer}>
      <header>
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
        {actions}
      </header>
      {children}
    </section>
  )
}

export interface KeyValueProps {
  items: { label: ReactNode; value: ReactNode; source?: SourceStamp; hint?: ReactNode }[]
  columns?: 1 | 2 | 3
}

export function KeyValue({ items, columns = 1 }: KeyValueProps) {
  return (
    <dl data-columns={columns}>
      {items.map((item, i) => (
        <div key={i}>
          <dt>{item.label}</dt>
          <dd>
            {item.value}
            {item.hint ? <small>{item.hint}</small> : null}
            {item.source ? <SourceLine stamp={item.source} compact /> : null}
          </dd>
        </div>
      ))}
    </dl>
  )
}
