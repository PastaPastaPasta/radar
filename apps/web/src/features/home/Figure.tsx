import { useMemo, type ReactNode } from 'react'
import type { SourceStamp } from '@/data/envelope'
import { Skeleton, SourceLine } from '@/ui'
import { SourceScope, sourceKey } from '@/ui/source-scope'
import { useLeadSources } from '@/ui/stat'

interface FigureProps {
  /** The figure's name; pass a link with `rx-fig__link` to make the whole figure open it. */
  label: ReactNode
  value: ReactNode
  note?: ReactNode
  /** Where this figure came from: shown under it on hover and focus, because its section names the source once. */
  source?: SourceStamp
  loading?: boolean
  tone?: 'good' | 'warn' | 'bad'
  layer?: 'core' | 'platform' | 'network'
  attrs?: Record<`data-${string}`, string | undefined>
}

/** One quiet figure: a label, a value and at most one note, with a rule on its left and no box. */
export function Figure({ label, value, note, source, loading, tone, layer, attrs }: FigureProps) {
  return (
    <div
      className="rx-fig"
      data-src-hover
      data-tone={tone}
      data-layer={layer}
      aria-busy={loading ? true : undefined}
      {...attrs}
    >
      <dt className="rx-fig__label">{label}</dt>
      <dd className="rx-fig__value">{loading ? <Skeleton shape="line" width="5ch" /> : value}</dd>
      {note && !loading ? <dd className="rx-fig__note">{note}</dd> : null}
      {source ? (
        <dd className="rx-fig__src">
          <SourceLine stamp={source} compact />
        </dd>
      ) : null}
    </div>
  )
}

export function Figures({
  children,
  ...rest
}: { children: ReactNode } & Record<`data-${string}`, string | undefined>) {
  return (
    <dl className="rx-figs" {...rest}>
      {children}
    </dl>
  )
}

/**
 * A section's one source line: each source once, with the stamp that speaks for it (`useLeadSources`; of several,
 * `SourceLine` shows the oldest), and the keys of every source it covers, so the cards and figures inside a
 * `SourceScope` of them leave their own marks out.
 */
export function useSectionSources(stamps: readonly (SourceStamp | undefined)[]): {
  line: SourceStamp[]
  covered: ReadonlySet<string>
} {
  const lead = useLeadSources(stamps)
  const line = stamps.filter((s, i): s is SourceStamp => s !== undefined && lead[i] === true)
  const keys = stamps.flatMap((s) => (s ? [sourceKey(s)] : [])).join(',')
  const covered = useMemo(() => new Set(keys ? keys.split(',') : []), [keys])
  return { line, covered }
}

export function SourceRow({ line }: { line: SourceStamp[] }) {
  if (line.length === 0) return null
  return (
    <p className="rx-home__src" data-home-sources>
      <SourceLine stamp={line} compact />
    </p>
  )
}

export { SourceScope }
