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
import type { HeightChain, SourceStamp } from '@/data/envelope'
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

/** The ids in `ids` that have stayed in it for `ms`, and none that left it since. An id keeps its start when others come and go. */
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
  const since = useRef(new Map<string, number>())
  useEffect(() => {
    const current = key ? key.split('\n') : []
    const now = Date.now()
    for (const id of [...since.current.keys()]) if (!current.includes(id)) since.current.delete(id)
    const timers = current.map((id) => {
      const start = since.current.get(id) ?? now
      since.current.set(id, start)
      return setTimeout(
        () => setState((s) => (s.held.has(id) ? s : { ...s, held: new Set(s.held).add(id) })),
        Math.max(0, ms - (now - start)),
      )
    })
    return () => timers.forEach(clearTimeout)
  }, [key, ms])
  return state.held
}

/** The chain a stamp's height counts on: Platform for the Platform SDK and the explorer, else what the stamp says, else Core. */
export function heightChainOf(stamp: SourceStamp): HeightChain {
  return (
    stamp.heightChain ?? (stamp.source === 'sdk' || stamp.source === 'pe' ? 'platform' : 'core')
  )
}

/**
 * Which of a group's figures speak for their source, by position. The first figure of each source does; a later one is
 * read as part of the same group and stays quiet. A figure whose source height is below the newest height of its source
 * on the same chain speaks for itself once it has trailed for a grace period, so a figure that stopped refreshing can't
 * hide behind one that is current. Heights compare only within a chain (Core and Platform numbers say nothing about
 * each other). Where heights can't be compared, because the group's first figure or this one has none or they are on
 * different chains, read times decide. Between figures on the same chain a fetch time plays no part: a republish of the
 * same tip says nothing about whether the other reads are current.
 */
export function useLeadSources(
  sources: readonly (SourceStamp | undefined)[],
  /** A stable name for each position. Without it a figure is known by its index, which only holds while the list keeps its order. */
  ids?: readonly string[],
): boolean[] {
  const idOf = (i: number) => ids?.[i] ?? String(i)
  const lineOf = (source: SourceStamp) => `${sourceKey(source)}#${heightChainOf(source)}`
  const newest = new Map<string, number>()
  for (const source of sources) {
    if (source?.height === undefined) continue
    const key = lineOf(source)
    newest.set(key, Math.max(newest.get(key) ?? -1, source.height))
  }
  const trailing = sources.flatMap((source, i) =>
    source?.height !== undefined && source.height < (newest.get(lineOf(source)) ?? -1)
      ? [idOf(i)]
      : [],
  )
  const behind = useSustained(trailing, BEHIND_GRACE_MS)
  const seen = new Map<string, SourceStamp>()
  return sources.map((source, i) => {
    if (!source) return false
    const key = sourceKey(source)
    const first = seen.get(key)
    if (first === undefined) {
      seen.set(key, source)
      return true
    }
    const comparable =
      source.height !== undefined &&
      first.height !== undefined &&
      heightChainOf(source) === heightChainOf(first)
    if (!comparable && first.asOf - source.asOf > SAME_READ_MS) return true
    return behind.has(idOf(i))
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

/** What the line shows of a stamp. A proof is named by its id: its values have no text form. */
function stampSignature(s: SourceStamp): string {
  return [
    sourceKey(s),
    s.asOf,
    s.fetchedAt,
    s.height ?? '',
    heightChainOf(s),
    s.node ?? '',
    s.immutable ? 'immutable' : '',
    s.asOfFetched ? 'fetched' : '',
    s.staleAfterMs ?? '',
    s.proof?.id ?? '',
  ].join('|')
}

/** What a part handed to its section's line, for `data-reports`: one word per source, `sdk:proved` for a proved read. */
export function reportsAttr(stamps: readonly SourceStamp[]): string | undefined {
  const words = stamps.map((s) =>
    [s.source, s.proved ? 'proved' : '', s.fallback ?? ''].filter(Boolean).join(':'),
  )
  return words.length > 0 ? [...new Set(words)].join(' ') : undefined
}

/**
 * The state behind a section's one source line. `own` are the stamps the section was given; they come first, so they
 * speak for their sources while the parts inside are as fresh. A part's stamp of the same source is not dropped: a
 * read that trails or was made well before the section's own joins the line, so a stale or failing part can't hide
 * behind it. Which stamp speaks for a source is `useLeadSources`; of several, `SourceLine` shows the oldest.
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
  const all: (SourceStamp | undefined)[] = [...given]
  const ids = given.map((_, i) => `own:${i}`)
  for (const [id, stamps] of reported) {
    stamps.forEach((s, i) => {
      all.push(s)
      ids.push(`${id}:${i}`)
    })
  }
  const lead = useLeadSources(all, ids)
  const line = all.filter((s, i): s is SourceStamp => s !== undefined && lead[i] === true)
  return { collector, line }
}

/** The stamps the enclosing section's line shows. */
export function useSectionLine(): readonly SourceStamp[] {
  return useContext(sectionLineContext())
}
