import type { ReactNode } from 'react'
import type { SourceId, SourceStamp } from '@/data/envelope'
import { useSourceHealth, type HealthState } from '@/data/health'
import { cx } from './cx'
import { Icon, type IconName } from './icon'
import { useNow } from './hooks'
import { useLiveView } from './live-connection'
import { openProofInspector } from './proof'
import { sourceName, sourceView } from './source-labels'
import { distinctSources } from './source-scope'

export interface SourceLineProps {
  stamp: SourceStamp | SourceStamp[]
  compact?: boolean
}

function SourceMark({ stamp, compact }: { stamp: SourceStamp; compact: boolean }) {
  const health = useSourceHealth(stamp.source)
  const now = useNow(!stamp.immutable)
  const v = sourceView(stamp, health, now)
  const attrs = {
    'data-source': stamp.source,
    'data-proved': String(stamp.proved),
    'data-fallback': stamp.fallback,
    'data-state': v.variant,
    title: v.title,
  }
  const age = v.spinner ? (
    <span className="dh-spin" aria-hidden="true" />
  ) : v.age ? (
    <time dateTime={new Date(stamp.asOf).toISOString()} title={v.ageTitle}>
      {v.age}
    </time>
  ) : null
  const status =
    v.variant === 'stale' ? (
      <span className="dh-sr"> (out of date)</span>
    ) : v.variant === 'down' ? (
      <span className="dh-sr"> (source down)</span>
    ) : null

  if (!compact) {
    const line = (
      <>
        <LiveDot state={v.state} bare />
        <span>
          {v.label}
          {age ? <> {age}</> : null}
        </span>
        {status}
      </>
    )
    const openable = v.variant === 'proof' ? stamp.proof : undefined
    if (openable) {
      return (
        <button
          type="button"
          className="rx-srcline rx-srcline--button"
          {...attrs}
          title={`Open the proof for this figure${v.title ? ` · ${v.title}` : ''}`}
          onClick={() => {
            openProofInspector(openable)
          }}
        >
          {line}
        </button>
      )
    }
    return (
      <span className="rx-srcline" {...attrs}>
        {line}
      </span>
    )
  }

  const className = cx(
    'rx-src',
    v.variant === 'proof' && 'rx-src--proof',
    v.variant === 'stale' && 'rx-src--stale',
    v.variant === 'down' && 'rx-src--down',
  )
  const content = (
    <>
      <Icon name={v.icon} />
      {v.label}
      {age}
      {status}
    </>
  )
  const proof = stamp.proof
  if (v.variant === 'proof' && proof) {
    return (
      <button
        type="button"
        className={className}
        {...attrs}
        title={`Open the proof for this figure${v.title ? ` · ${v.title}` : ''}`}
        onClick={() => {
          openProofInspector(proof)
        }}
      >
        {content}
      </button>
    )
  }
  return (
    <span className={className} {...attrs}>
      {content}
    </span>
  )
}

export function SourceLine({ stamp, compact = false }: SourceLineProps) {
  const stamps = distinctSources(Array.isArray(stamp) ? stamp : [stamp])
  return (
    <span className={cx('rx-sources', compact && 'rx-sources--compact')}>
      {stamps.map((s, i) => (
        <SourceMark key={`${s.source}-${i}`} stamp={s} compact={compact} />
      ))}
    </span>
  )
}

const LIVE_WORD: Record<HealthState | 'live', string> = {
  live: 'Live',
  ok: 'Live',
  slow: 'Slow',
  stale: 'Behind',
  degraded: 'Behind',
  down: 'Down',
  unknown: 'Checking',
}

const LIVE_CLASS: Record<HealthState | 'live', string> = {
  live: '',
  ok: '',
  slow: '',
  stale: 'rx-fresh--stale',
  degraded: 'rx-fresh--stale',
  down: 'rx-fresh--down',
  unknown: 'rx-fresh--unknown',
}

export interface LiveDotProps {
  state: HealthState | 'live'
  /** Draw the dot alone: the caller supplies the word. */
  bare?: boolean
}

export function LiveDot({ state, bare = false }: LiveDotProps) {
  const view = useLiveView()
  // An explicit "live" is the page's own claim; the connection can qualify it.
  const shown = state === 'live' ? view.dot : state
  const pulses = shown === 'live' || shown === 'ok'
  const dot = (
    <span
      className={cx('rx-fresh', LIVE_CLASS[shown], pulses && 'is-pulse')}
      aria-hidden="true"
      data-live-dot={shown}
    />
  )
  if (bare) return dot
  return (
    <span
      className="rx-livedot"
      data-state={shown}
      data-connection={state === 'live' ? view.state : undefined}
      title={state === 'live' ? view.title : undefined}
    >
      {dot}
      {state === 'live' ? view.word : LIVE_WORD[state]}
    </span>
  )
}

export interface LiveControlProps {
  paused: boolean
  onToggle: () => void
  /** Rows that arrived while paused. */
  newCount?: number
  /** Change to replay the one-ring pulse when data lands. */
  pulseKey?: string | number
  noun?: string
}

/** The Live/Pause pill every auto-updating feed carries. */
export function LiveControl({
  paused,
  onToggle,
  newCount = 0,
  pulseKey,
  noun = 'live updates',
}: LiveControlProps) {
  const view = useLiveView()
  const word = paused ? (newCount > 0 ? `Paused · ${newCount} new` : 'Paused') : view.word
  const degraded = !paused && view.dot !== 'live'
  return (
    <span
      className={cx('rx-live', paused && 'is-paused', degraded && `rx-live--${view.dot}`)}
      data-connection={paused ? undefined : view.state}
      title={paused ? undefined : view.title}
    >
      <span
        key={pulseKey}
        className={cx(
          'rx-fresh',
          !paused && view.dot === 'live' && 'is-pulse',
          degraded && LIVE_CLASS[view.dot],
        )}
        aria-hidden="true"
      />
      <span className="rx-live__word">{word}</span>
      <button
        type="button"
        aria-label={paused ? `Resume ${noun}` : `Pause ${noun}`}
        aria-pressed={paused}
        onClick={onToggle}
      >
        <Icon name={paused ? 'play' : 'pause'} size="sm" />
      </button>
    </span>
  )
}

export interface EmptyProps {
  kind: 'none-yet' | 'no-match' | 'not-found' | 'unsupported-network' | 'blocked'
  title: ReactNode
  body?: ReactNode
  action?: ReactNode
}

const EMPTY_ICON: Record<EmptyProps['kind'], IconName> = {
  'none-yet': 'doc',
  'no-match': 'filter',
  'not-found': 'search',
  'unsupported-network': 'globe',
  blocked: 'alert',
}

export function Empty({ kind, title, body, action }: EmptyProps) {
  return (
    <div className="rx-empty" data-empty={kind}>
      <span className={cx('rx-empty__tile', kind === 'blocked' && 'rx-empty__tile--warn')}>
        <Icon name={EMPTY_ICON[kind]} />
      </span>
      <p className="rx-empty__t">{title}</p>
      {body ? <p className="rx-empty__b">{body}</p> : null}
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

interface ErrorShape {
  source?: SourceId
  kind?: string
  message?: string
}

export function describeError(error: unknown, source?: SourceId): { title: string; body: string } {
  const e: ErrorShape = typeof error === 'object' && error !== null ? error : {}
  const from = e.source ?? source
  const name = from ? sourceName(from) : undefined
  const rest = 'The rest of this page still works.'
  switch (e.kind) {
    case 'rate-limited':
      return { title: `${name ?? 'The source'} is busy`, body: `Try again in a moment. ${rest}` }
    case 'invalid-response':
      return {
        title: `${name ?? 'The source'} sent something Radar couldn't read`,
        body: `This is a Radar bug, not your connection. ${rest}`,
      }
    case 'proof-failed':
      return {
        title: "A proof didn't verify",
        body: `Radar won't show the figure as proof-checked. ${rest}`,
      }
    case 'unavailable':
      return { title: `${name ?? 'This source'} isn't available here`, body: rest }
    case 'network':
    case 'timeout':
    case 'http':
      return { title: `${name ?? 'The source'} isn't answering`, body: rest }
    default:
      return { title: name ? `${name} isn't answering` : 'Something went wrong', body: rest }
  }
}

export function ErrorState({ error, source, onRetry, compact }: ErrorStateProps) {
  const { title, body } = describeError(error, source)
  const detail = error instanceof Error ? error.message : undefined
  const retry = onRetry ? (
    <button type="button" className="dh-btn dh-btn--sm" onClick={onRetry}>
      Retry
    </button>
  ) : null
  if (compact) {
    return (
      <div className="rx-errrow" role="alert" data-compact="1" data-source={source}>
        <Icon name="alert" />
        <span title={detail}>{title}</span>
        {retry}
      </div>
    )
  }
  return (
    <div className="rx-empty rx-empty--error" role="alert" data-source={source}>
      <span className="rx-empty__tile">
        <Icon name="alert" />
      </span>
      <p className="rx-empty__t" title={detail}>
        {title}
      </p>
      <p className="rx-empty__b">{body}</p>
      {retry}
    </div>
  )
}

export interface SkeletonProps {
  shape: 'line' | 'block' | 'stat' | 'row' | 'chip' | 'chart'
  count?: number
  width?: string
  height?: number
}

const LINE_WIDTHS = ['70%', '90%', '55%', '80%', '62%']
const BAR_HEIGHTS = [38, 62, 48, 80, 55, 70, 44, 88, 52, 66, 40, 58]

function SkeletonOne({ shape, index, width, height }: SkeletonProps & { index: number }) {
  switch (shape) {
    case 'line':
      return (
        <span
          className="rx-skel"
          style={{ width: width ?? LINE_WIDTHS[index % LINE_WIDTHS.length] }}
        />
      )
    case 'block':
      return (
        <span
          className="rx-skel rx-skel--block"
          style={{ width: width ?? '100%', height: height ?? 96 }}
        />
      )
    case 'stat':
      return (
        <span className="rx-skel-stat" style={{ width }}>
          <span className="rx-skel" style={{ width: '45%' }} />
          <span className="rx-skel rx-skel--value" />
        </span>
      )
    case 'row':
      return (
        <span className="rx-skel-row" style={{ height: height ?? 44, width }}>
          {[18, 34, 14, 22, 12].map((w, i) => (
            <span key={i} className="rx-skel" style={{ width: `${w - (index % 3) * 2}%` }} />
          ))}
        </span>
      )
    case 'chip':
      return (
        <span className="rx-skel-chip" style={{ width }}>
          <span className="rx-skel rx-skel--glyph" />
          <span className="rx-skel" style={{ width: 80 }} />
        </span>
      )
    case 'chart':
      return (
        <span className="rx-skel-chart" style={{ height: height ?? 200, width: width ?? '100%' }}>
          {BAR_HEIGHTS.map((h, i) => (
            <span key={i} className="rx-skel" style={{ height: `${h}%` }} />
          ))}
        </span>
      )
  }
}

export function Skeleton({ shape, count = 1, width, height }: SkeletonProps) {
  return (
    <span className={cx('rx-skels', `rx-skels--${shape}`)} aria-hidden="true" data-skeleton={shape}>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonOne key={i} shape={shape} index={i} width={width} height={height} />
      ))}
    </span>
  )
}
