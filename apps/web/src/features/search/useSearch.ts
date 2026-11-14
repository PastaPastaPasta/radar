import { useEffect, useMemo, useState } from 'react'
import { isSourceError, SourceError } from '@/data/errors'
import { useDecentralizedOnly } from '@/data/health'
import { useNetwork } from '@/features/entity'
import type { NetworkId } from '@/lib/network'
import { decentralizedOnly } from '@/lib/source-mode'
import { classify, type Classified } from './classify'
import { searchEnv } from './env'
import { useSdkState, useSearchTip } from './tip'
import { networkHintHit } from './network-hint'
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
      return true
    case 'index':
      // Every index lookup goes to a hosted service, which Decentralized only mode never asks.
      return !decentralizedOnly()
    case 'dapi':
      return searchEnv.canAffordDapi(net)
    case 'sdk':
      return mode === 'page' || searchEnv.sdkState(net) === 'ready'
  }
}

export function planResolvers(
  c: Classified,
  net: NetworkId,
  mode: SearchMode,
  tipReading = false,
): Resolver[] {
  if (c.networkHint || c.classes.length === 0) return []
  return registry.filter(
    (r) =>
      (!c.warning || r.cost === 'local') &&
      !(r.waitsForTip && tipReading) &&
      r.accepts.some((k) => c.classes.includes(k)) &&
      allowed(r, net, mode),
  )
}

export function mergeHits(lists: SearchHit[][]): SearchHit[] {
  const best = new Map<string, SearchHit>()
  for (const hit of lists.flat()) {
    // One node, one hit: an evonode is a masternode with a Platform role, and both land on the same page.
    const key = `${hit.kind === 'evonode' ? 'masternode' : hit.kind}:${hit.id}`
    const current = best.get(key)
    const confirms = current?.speculative && !hit.speculative
    const specific =
      hit.kind === 'evonode' && current?.kind === 'masternode' && hit.rank === current.rank
    // At equal rank the proof-checked answer is the one to show: a hit Platform Explorer and the SDK both found.
    const proves = hit.rank === current?.rank && hit.stamp.proved && !current.stamp.proved
    if (!current || hit.rank > current.rank || confirms || proves || specific) best.set(key, hit)
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
  // Read so a change of mode plans the lookups again.
  const indexOff = useDecentralizedOnly()
  const input = useDebounced(q, mode === 'palette' ? PALETTE_DEBOUNCE_MS : 0)
  const { tip, reading: tipReading, unread } = useSearchTip(net, mode, q.trim() !== '')
  // Read so the SDK reaching 'ready' plans its lookups in the palette.
  useSdkState(net)
  const wordsReady = useWordlistLoaded()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the wordlist arriving changes the answer
  const classified = useMemo(() => classify(input, net, tip), [input, net, tip, wordsReady])
  const planned = planResolvers(classified, net, mode, tipReading)
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
  const hits = hint ? [hint] : mergeHits(planned.map((r) => settled[r.id]?.hits ?? []))
  const pending = planned.map((r) => r.id).filter((id) => !(id in settled))
  const pendingLocal = planned
    .filter((r) => r.cost === 'local' && !(r.id in settled))
    .map((r) => r.id)
  const failed = [
    ...Object.entries(settled).flatMap(([id, s]) => (s.error ? [{ id, error: s.error }] : [])),
    // Platform heights and epochs are offered only up to the Platform tip, so a tip that can't be read hides them.
    ...(mode === 'page' && unread !== undefined
      ? [{ id: 'platform-tip', error: toSourceError(unread, false) }]
      : []),
  ]
  const skipped =
    indexOff && !classified.networkHint && !classified.warning
      ? registry
          .filter(
            (r) => r.cost === 'index' && r.accepts.some((k) => classified.classes.includes(k)),
          )
          .map((r) => r.id)
      : []
  return { hits, pending, pendingLocal, failed, skipped, classified }
}
