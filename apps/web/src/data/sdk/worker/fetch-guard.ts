import type { NodeUse } from '../methods'

/** The most Platform requests one node gets from this tab in a minute, leaving room for the Core pool's 50 under the gateway's per-IP limit. */
export const SDK_PER_NODE_PER_MINUTE = 30
export const SDK_PER_NODE_IN_FLIGHT = 4
/** A request that would wait longer than this for a node's budget is answered as rate limited instead. */
export const SDK_MAX_WAIT_MS = 15_000
const WINDOW_MS = 60_000
const SERVER_FULL_BELOW = 30
const MAX_RESET_S = 120
const USAGE_LIMIT = 500
const PLATFORM_PATH = '/org.dash.platform.dapi.v0.'

interface HostState {
  started: number[]
  inFlight: number
  pausedUntil: number
  waiters: (() => void)[]
}

export interface FetchGuard {
  fetch: typeof fetch
  /** The requests sent since the last call, for the main thread to count against the Core pool's per-node budget. */
  drain(): NodeUse[]
}

function rateLimited(resetS: number): Response {
  return new Response(null, {
    status: 200,
    headers: {
      'grpc-status': '8',
      'grpc-message': 'Radar is pacing its requests to this node',
      'ratelimit-reset': String(resetS),
    },
  })
}

function targetOf(input: RequestInfo | URL): URL | undefined {
  try {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const url = new URL(raw)
    return url.protocol === 'https:' && url.pathname.startsWith(PLATFORM_PATH) ? url : undefined
  } catch {
    return undefined
  }
}

function resetOf(headers: Headers): number | undefined {
  const raw = headers.get('ratelimit-reset')
  const n = raw === null || raw.trim() === '' ? NaN : Number(raw)
  return Number.isFinite(n) ? Math.min(MAX_RESET_S, Math.max(1, Math.ceil(n))) : undefined
}

/**
 * The SDK picks its own evonodes and sends from inside the wasm through the worker's `fetch`. Wrapping it is the one
 * place those requests can be seen: each is paced per node (a minute window and an in-flight cap), a node that says
 * its window is nearly spent is left alone until it resets, and every request is recorded so the main thread can count
 * it against the same per-node budget as Core calls (§4.3).
 */
export function createFetchGuard(
  base: typeof fetch,
  opts: { now?: () => number; perNode?: number; inFlight?: number } = {},
): FetchGuard {
  const now = opts.now ?? Date.now
  const perNode = opts.perNode ?? SDK_PER_NODE_PER_MINUTE
  const maxInFlight = opts.inFlight ?? SDK_PER_NODE_IN_FLIGHT
  const hosts = new Map<string, HostState>()
  let used: NodeUse[] = []

  const stateOf = (host: string): HostState => {
    let s = hosts.get(host)
    if (!s) hosts.set(host, (s = { started: [], inFlight: 0, pausedUntil: 0, waiters: [] }))
    return s
  }

  /** Milliseconds until `host` can take a request; 0 when it can now. */
  function waitFor(s: HostState): number {
    const t = now()
    s.started = s.started.filter((at) => t - at < WINDOW_MS)
    const paused = Math.max(0, s.pausedUntil - t)
    const spent = s.started.length >= perNode ? Math.max(0, s.started[0]! + WINDOW_MS - t) : 0
    return Math.max(paused, spent)
  }

  /** Resolves true with the slot already taken, or false when the wait would pass the limit. */
  async function admit(s: HostState, host: string, signal: AbortSignal | null | undefined) {
    const deadline = now() + SDK_MAX_WAIT_MS
    for (;;) {
      if (signal?.aborted) throw signal.reason ?? new DOMException('aborted', 'AbortError')
      const wait = waitFor(s)
      if (wait === 0 && s.inFlight < maxInFlight) {
        const at = now()
        s.started.push(at)
        s.inFlight++
        if (used.length < USAGE_LIMIT) used.push({ host, at })
        return true
      }
      if (now() + wait > deadline) return false
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, wait > 0 ? wait : 250)
        s.waiters.push(() => {
          clearTimeout(timer)
          resolve()
        })
      })
    }
  }

  const guarded = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = targetOf(input)
    if (!url) return base(input, init)
    const s = stateOf(url.host)
    if (!(await admit(s, url.host, init?.signal)))
      return rateLimited(Math.ceil(waitFor(s) / 1000) || 1)
    try {
      const res = await base(input, init)
      const remaining = Number(res.headers.get('ratelimit-remaining'))
      const reset = resetOf(res.headers)
      const status = Number(res.headers.get('grpc-status'))
      if (res.status === 429 || status === 8) s.pausedUntil = now() + (reset ?? 60) * 1000
      else if (res.headers.get('ratelimit-remaining') !== null && remaining < SERVER_FULL_BELOW) {
        s.pausedUntil = now() + (reset ?? 60) * 1000
      }
      return res
    } finally {
      s.inFlight--
      for (const wake of s.waiters.splice(0)) wake()
    }
  }

  return {
    fetch: guarded,
    drain() {
      const out = used
      used = []
      return out
    },
  }
}
