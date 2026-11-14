import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type Context,
  type ReactNode,
} from 'react'
import type { SourceStamp } from '@/data/envelope'
import { sourceKey } from './source-scope'

/** What a component may be given as its source: one stamp, or several with gaps for reads that have not landed. */
export type SourceInput = SourceStamp | readonly (SourceStamp | undefined)[] | undefined

export function stampsOfInput(source: SourceInput): SourceStamp[] {
  if (source === undefined) return []
  if (!isStampList(source)) return [source]
  return source.filter((s): s is SourceStamp => s !== undefined)
}

function isStampList(source: SourceInput): source is readonly (SourceStamp | undefined)[] {
  return Array.isArray(source)
}

/** A figure with no height of its own, read this much earlier than its group's first, shows its own age instead of borrowing the group's. */
const SAME_READ_MS = 30_000

/** How long a figure may trail the newest height of its source before it says so: its refetch is usually still in flight. */
export const BEHIND_GRACE_MS = 8_000

/** The ids in `ids` that have stayed in it for `ms`, and none that left it since. */
function useSustained(ids: readonly string[], ms: number): ReadonlySet<string> {
  const key = ids.join('\n')
  const [state, setState] = useState<{ key: string; held: ReadonlySet<string> }>({
    key,
    held: new Set(),
  })
  if (state.key !== key) {
    const current = new Set(ids)
    setState({ key, held: new Set([...state.held].filter((id) => current.has(id))) })
  }
  useEffect(() => {
    const timers = key
      ? key
          .split('\n')
          .map((id) =>
            setTimeout(() => setState((s) => ({ ...s, held: new Set(s.held).add(id) })), ms),
          )
      : []
    return () => timers.forEach(clearTimeout)
  }, [key, ms])
  return state.held
}

/**
 * Which of a group's figures speak for their source, by position. The first figure of each source does; a later one is
 * read as part of the same group and stays quiet. A figure whose source height is below the newest height of its source
 * in the group speaks for itself once it has trailed for a grace period, so a figure that stopped refreshing can't hide
 * behind one that is current. Fetch times play no part for figures that carry a height: a republish of the same tip says
 * nothing about whether the other reads are current. Figures without a height fall back to comparing read times.
 */
export function useLeadSources(sources: readonly (SourceStamp | undefined)[]): boolean[] {
  const newest = new Map<string, number>()
  for (const source of sources) {
    if (source?.height === undefined) continue
    const key = sourceKey(source)
    newest.set(key, Math.max(newest.get(key) ?? -1, source.height))
  }
  const trailing = sources.flatMap((source, i) =>
    source?.height !== undefined && source.height < (newest.get(sourceKey(source)) ?? -1)
      ? [String(i)]
      : [],
  )
  const behind = useSustained(trailing, BEHIND_GRACE_MS)
  const seen = new Map<string, number>()
  return sources.map((source, i) => {
    if (!source) return false
    const key = sourceKey(source)
    const first = seen.get(key)
    if (first === undefined) {
      seen.set(key, source.asOf)
      return true
    }
    return source.height === undefined ? first - source.asOf > SAME_READ_MS : behind.has(String(i))
  })
}

interface Collector {
  /** Hands the section the stamps one of its parts shows; an empty list takes them back. */
  report: (id: string, stamps: readonly SourceStamp[]) => void
}

// Made on first use, not at load: a module that does work when it loads is bundled into the entry chunk through the
// kit barrel, and only pages need this one.
let collecting: Context<Collector | null> | undefined
let sectionLine: Context<readonly SourceStamp[]> | undefined
const collectingContext = () => (collecting ??= createContext<Collector | null>(null))
const sectionLineContext = () => (sectionLine ??= createContext<readonly SourceStamp[]>([]))

/** Cuts a subtree off from the section around it, so what it shows keeps its own marks (a hover card, a dialog). */
export function NoSourceSection({ children }: { children: ReactNode }) {
  return createElement(collectingContext(), { value: null }, children)
}

/** Makes `collector` the section its subtree reports to, and `line` what that section's source line shows. */
export function SourceSectionProvider({
  collector,
  line,
  children,
}: {
  collector: Collector
  line: readonly SourceStamp[]
  children: ReactNode
}) {
  return createElement(
    collectingContext(),
    { value: collector },
    createElement(sectionLineContext(), { value: line }, children),
  )
}

/** True inside a section that names its sources in one line. */
export function useInSourceSection(): boolean {
  return useContext(collectingContext()) !== null
}

/**
 * Hands this part's stamps to the section around it, which names every source once in its own line. Returns true when
 * a section took them, so the part leaves its own mark out (or keeps it for hover and focus).
 */
export function useSectionSource(source: SourceInput): boolean {
  const collector = useContext(collectingContext())
  const id = useId()
  const stamps = stampsOfInput(source)
  const latest = useRef(stamps)
  useEffect(() => {
    latest.current = stamps
  })
  const signature = stamps.map(stampSignature).join('\n')
  useEffect(() => {
    if (!collector) return
    collector.report(id, latest.current)
    return () => collector.report(id, [])
  }, [collector, id, signature])
  return collector !== null
}

/** What the line shows of a stamp. A proof is left out: it can hold values with no text form, and it travels with its read. */
function stampSignature(s: SourceStamp): string {
  return [
    sourceKey(s),
    s.asOf,
    s.fetchedAt,
    s.height ?? '',
    s.node ?? '',
    s.immutable ? 'immutable' : '',
    s.asOfFetched ? 'fetched' : '',
    s.staleAfterMs ?? '',
  ].join('|')
}

/**
 * The state behind a section's one source line. `own` are the stamps the section was given; they speak for their
 * sources, and a part inside that reports the same source adds nothing. Each other source a part reports joins the
 * line. Which stamp speaks for a source is `useLeadSources`; of several, `SourceLine` shows the oldest.
 */
export function useSourceCollector(own: SourceInput): {
  collector: Collector
  line: SourceStamp[]
} {
  const [reported, setReported] = useState<ReadonlyMap<string, readonly SourceStamp[]>>(
    () => new Map(),
  )
  const collector = useMemo<Collector>(
    () => ({
      report(id, stamps) {
        setReported((prev) => {
          if (stamps.length === 0 && !prev.has(id)) return prev
          const next = new Map(prev)
          if (stamps.length === 0) next.delete(id)
          else next.set(id, stamps)
          return next
        })
      },
    }),
    [],
  )
  const given = isStampList(own) ? own : own ? [own] : []
  const named = new Set(stampsOfInput(own).map(sourceKey))
  const all = [...given, ...[...reported.values()].flat().filter((s) => !named.has(sourceKey(s)))]
  const lead = useLeadSources(all)
  const line = all.filter((s, i): s is SourceStamp => s !== undefined && lead[i] === true)
  return { collector, line }
}

/** The stamps the enclosing section's line shows. */
export function useSectionLine(): readonly SourceStamp[] {
  return useContext(sectionLineContext())
}
