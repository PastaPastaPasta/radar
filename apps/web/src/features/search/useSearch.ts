import { useEffect, useMemo, useState } from 'react'
import { isSourceError, SourceError } from '@/data/errors'
import { useNetwork } from '@/features/entity'
import type { NetworkId } from '@/lib/network'
import { classify, type Classified, type Tip } from './classify'
import { searchEnv } from './env'
import { networkHintHit } from './network-hint'
import { offered } from './offered'
import { useWordlistLoaded } from './wordlist'
import { resolvers as registry } from './resolvers'
import type { Resolver, SearchHit, SearchMode, SearchResult } from './types'

export const RESOLVER_TIMEOUT_MS = 4000
export const PALETTE_DEBOUNCE_MS = 150

interface Settled {
  hits?: SearchHit[]
  error?: SourceError
}

interface RunState {
  key: string
  settled: Record<string, Settled>
}

const EMPTY: RunState = { key: '', settled: {} }

export function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    if (ms === 0) return
    const id = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return ms === 0 ? value : debounced
}

function allowed(r: Resolver, net: NetworkId, mode: SearchMode): boolean {
  switch (r.cost) {
    case 'local':
    case 'index':
      return true
    case 'dapi':
      return searchEnv.canAffordDapi(net)
    case 'sdk':
      return mode === 'page' || searchEnv.sdkState(net) === 'ready'
  }
}

export function planResolvers(c: Classified, net: NetworkId, mode: SearchMode): Resolver[] {
  if (c.networkHint || c.classes.length === 0) return []
  return registry.filter(
    (r) =>
      (!c.warning || r.cost === 'local') &&
      r.accepts.some((k) => c.classes.includes(k)) &&
      allowed(r, net, mode),
  )
}

export function mergeHits(lists: SearchHit[][]): SearchHit[] {
  const best = new Map<string, SearchHit>()
  for (const hit of lists.flat()) {
    const key = `${hit.kind}:${hit.id}`
    const current = best.get(key)
    const confirms = current?.speculative && !hit.speculative
    if (!current || hit.rank > current.rank || confirms) best.set(key, hit)
  }
  return [...best.values()].sort((a, b) => b.rank - a.rank)
}

function toSourceError(e: unknown, timedOut: boolean): SourceError {
  if (timedOut) {
    return new SourceError({ source: 'local', kind: 'timeout', message: 'Timed out', cause: e })
  }
  if (isSourceError(e)) return e
  return new SourceError({
    source: 'local',
    kind: 'network',
    message: e instanceof Error ? e.message : 'Lookup failed',
    cause: e,
  })
}

function whenAborted(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    const fail = () => reject(new DOMException('Aborted', 'AbortError'))
    if (signal.aborted) fail()
    else signal.addEventListener('abort', fail, { once: true })
  })
}

export function useSearch(q: string, opts: { mode: SearchMode }): SearchResult {
  const { mode } = opts
  const net = useNetwork()
  const input = useDebounced(q, mode === 'palette' ? PALETTE_DEBOUNCE_MS : 0)
  const tipKey = JSON.stringify(searchEnv.tip(net) ?? null)
  const tip = useMemo(() => (JSON.parse(tipKey) as Tip | null) ?? undefined, [tipKey])
  const wordsReady = useWordlistLoaded()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the wordlist arriving changes the answer
  const classified = useMemo(() => classify(input, net, tip), [input, net, tip, wordsReady])
  const planned = planResolvers(classified, net, mode)
  const plannedIds = planned.map((r) => r.id).join(',')
  const key = `${net}|${mode}|${classified.normalized}|${plannedIds}`
  const [state, setState] = useState<RunState>(EMPTY)

  useEffect(() => {
    if (plannedIds === '') return
    const controller = new AbortController()
    const ids = plannedIds.split(',')
    for (const r of registry.filter((x) => ids.includes(x.id))) {
      const timeout = new AbortController()
      const timer = setTimeout(() => timeout.abort(), RESOLVER_TIMEOUT_MS)
      const signal = AbortSignal.any([controller.signal, timeout.signal])
      const record = (entry: Settled) => {
        if (controller.signal.aborted) return
        setState((prev) => ({
          key,
          settled: { ...(prev.key === key ? prev.settled : {}), [r.id]: entry },
        }))
      }
      Promise.race([r.resolve(classified, { net, signal, tip }), whenAborted(signal)])
        .then((hits) => record({ hits }))
        .catch((e: unknown) => record({ error: toSourceError(e, timeout.signal.aborted) }))
        .finally(() => clearTimeout(timer))
    }
    return () => controller.abort()
  }, [key, plannedIds, classified, net, tip])

  const settled = state.key === key ? state.settled : EMPTY.settled
  const hint = networkHintHit(classified)
  const hits = (hint ? [hint] : mergeHits(planned.map((r) => settled[r.id]?.hits ?? []))).filter(
    offered,
  )
  const pending = planned.map((r) => r.id).filter((id) => !(id in settled))
  const pendingLocal = planned
    .filter((r) => r.cost === 'local' && !(r.id in settled))
    .map((r) => r.id)
  const failed = Object.entries(settled).flatMap(([id, s]) =>
    s.error ? [{ id, error: s.error }] : [],
  )
  return { hits, pending, pendingLocal, failed, classified }
}
