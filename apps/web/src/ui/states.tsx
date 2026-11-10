import type { ReactNode } from 'react'
import type { SourceStamp } from '@/data/envelope'
import type { SourceId } from '@/data/envelope'
import type { HealthState } from '@/data/health'

export interface SourceLineProps {
  stamp: SourceStamp | SourceStamp[]
  compact?: boolean
}

export function SourceLine({ stamp, compact }: SourceLineProps) {
  const stamps = Array.isArray(stamp) ? stamp : [stamp]
  return (
    <p data-compact={compact ? '1' : undefined}>
      {stamps.map((s, i) => (
        <span
          key={i}
          data-source={s.source}
          data-proved={String(s.proved)}
          data-fallback={s.fallback}
        >
          {s.source}
        </span>
      ))}
    </p>
  )
}

export interface EmptyProps {
  kind: 'none-yet' | 'no-match' | 'not-found' | 'unsupported-network' | 'blocked'
  title: ReactNode
  body?: ReactNode
  action?: ReactNode
}

export function Empty({ kind, title, body, action }: EmptyProps) {
  return (
    <div data-empty={kind}>
      <p>{title}</p>
      {body ? <p>{body}</p> : null}
      {action}
    </div>
  )
}

export interface ErrorStateProps {
  error: unknown
  source?: SourceId
  onRetry?: () => void
  compact?: boolean
}

export function ErrorState({ error, source, onRetry, compact }: ErrorStateProps) {
  return (
    <div role="alert" data-source={source} data-compact={compact ? '1' : undefined}>
      <p>{error instanceof Error ? error.message : 'Something went wrong'}</p>
      {onRetry ? (
        <button type="button" onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </div>
  )
}

export interface SkeletonProps {
  shape: 'line' | 'block' | 'stat' | 'row' | 'chip' | 'chart'
  count?: number
  width?: string
  height?: number
}

export function Skeleton({ shape, count = 1, width, height }: SkeletonProps) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} aria-hidden="true" data-skeleton={shape} style={{ width, height }} />
      ))}
    </>
  )
}

export interface LiveDotProps {
  state: HealthState | 'live'
}

export function LiveDot({ state }: LiveDotProps) {
  return <span aria-hidden="true" data-live-dot={state} />
}
