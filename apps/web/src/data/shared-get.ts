/**
 * Every hosted read goes out through here. Two callers asking for the same URL while it is in flight share one request,
 * and Hyphen reads asked within a few milliseconds of each other go to the edge as one (`/x/hy/{net}/batch`, which
 * `workers/edge/src/proxy.ts` answers): a page that asks for a dozen Hyphen documents costs the zone's rate limit one
 * request. Each caller keeps its own timeout and cancellation; a shared read ends when the last caller gives up, or
 * on its own timeout.
 */

/** As many as the edge answers in one batch (`HYPHEN_BATCH_MAX` in `workers/edge/src/proxy.ts`). */
export const HYPHEN_BATCH_MAX = 16
const BATCH_WINDOW_MS = 4
const HYPHEN_READ = /^(.*\/x\/hy\/(?:mainnet|testnet))\/(.+)$/
const ACCEPT = { accept: 'application/json' }

export interface BatchResult {
  status: number
  body: unknown
  headers?: Record<string, string>
}

let batching = false

/** Batches Hyphen reads from now on; the app turns it on at start (`main.tsx`), tests that count requests leave it off. */
export function enableHyphenBatching(on = true): void {
  batching = on
}

interface Shared {
  read: Promise<Response>
  controller: AbortController
  waiting: number
}

const inflight = new Map<string, Shared>()

interface Queued {
  path: string
  url: string
  timeoutMs: number
  signal: AbortSignal
  resolve: (res: Response) => void
  reject: (e: unknown) => void
}

const queues = new Map<string, Queued[]>()

/** A shared read outlives its callers' own timers by this much, so each caller sees its own timeout first. */
const SHARED_GRACE_MS = 1_000

const cancelled = () => new DOMException('The read was cancelled', 'AbortError')

async function single(url: string, timeoutMs: number, signal: AbortSignal): Promise<Response> {
  const controller = new AbortController()
  const stop = () => controller.abort()
  const timer = setTimeout(stop, timeoutMs + SHARED_GRACE_MS)
  signal.addEventListener('abort', stop, { once: true })
  try {
    return await fetch(url, { headers: ACCEPT, signal: controller.signal })
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', stop)
  }
}

function answer({ status, body, headers }: BatchResult): Response {
  const bodyless = status === 204 || status === 205 || status === 304
  return new Response(bodyless ? null : JSON.stringify(body ?? null), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

const alone = (i: Queued) => single(i.url, i.timeoutMs, i.signal).then(i.resolve, i.reject)

async function flush(base: string): Promise<void> {
  const queued = queues.get(base) ?? []
  queues.delete(base)
  const items = queued.filter((i) => {
    if (i.signal.aborted) i.reject(cancelled())
    return !i.signal.aborted
  })
  if (items.length === 0) return
  if (items.length === 1) return void alone(items[0]!)
  const query = items.map((i) => `r=${encodeURIComponent(i.path)}`).join('&')
  const timeoutMs = Math.max(...items.map((i) => i.timeoutMs))
  // The batch ends early only when every read in it has been given up.
  const everyone = new AbortController()
  const left = { n: items.length }
  for (const i of items)
    i.signal.addEventListener('abort', () => --left.n === 0 && everyone.abort(), { once: true })
  try {
    const res = await single(`${base}/batch?${query}`, timeoutMs, everyone.signal)
    // An edge without the batch endpoint (a dev server's pass-through) answers 404: each read goes out alone.
    if (res.status === 404) {
      for (const i of items) void alone(i)
      return
    }
    if (!res.ok) throw new TypeError(`Hyphen batch failed: HTTP ${res.status}`)
    const { results } = (await res.json()) as { results?: BatchResult[] }
    items.forEach((item, n) => {
      const result = results?.[n]
      if (result) item.resolve(answer(result))
      else item.reject(new TypeError('Hyphen batch answer is missing a read'))
    })
  } catch (e) {
    for (const i of items) i.reject(e)
  }
}

function batched(base: string, item: Omit<Queued, 'resolve' | 'reject'>): Promise<Response> {
  return new Promise((resolve, reject) => {
    let queue = queues.get(base)
    if (!queue) {
      queues.set(base, (queue = []))
      setTimeout(() => void flush(base), BATCH_WINDOW_MS)
    }
    queue.push({ ...item, resolve, reject })
    if (queue.length >= HYPHEN_BATCH_MAX) void flush(base)
  })
}

function start(url: string, fragment: string, timeoutMs: number, signal: AbortSignal) {
  const hyphen = batching && !fragment ? HYPHEN_READ.exec(url) : null
  if (hyphen && !hyphen[2]!.startsWith('stream')) {
    return batched(hyphen[1]!, { path: hyphen[2]!, url, timeoutMs, signal })
  }
  return single(`${url}${fragment}`, timeoutMs, signal)
}

/**
 * A GET of `url` (absolute), shared with any other caller reading it right now. `fragment` tags the request for the
 * fixture layer (a health probe's `#radar-probe`) and is never sent; a probe still shares a read already in flight,
 * since that read is a live answer from the source too. The read is cancelled once every caller waiting on it is.
 */
export function sharedGet(
  url: string,
  {
    signal,
    timeoutMs,
    fragment = '',
  }: { signal: AbortSignal; timeoutMs: number; fragment?: string },
): Promise<Response> {
  if (signal.aborted) return Promise.reject(cancelled())
  let shared = inflight.get(url)
  if (!shared) {
    const controller = new AbortController()
    const read = start(url, fragment, timeoutMs, controller.signal)
    const entry: Shared = { read, controller, waiting: 0 }
    inflight.set(url, entry)
    const forget = () => {
      if (inflight.get(url) === entry) inflight.delete(url)
    }
    read.then(forget, forget)
    shared = entry
  }
  const entry = shared
  entry.waiting++
  return new Promise<Response>((resolve, reject) => {
    const onAbort = () => {
      reject(cancelled())
      if (--entry.waiting === 0) {
        if (inflight.get(url) === entry) inflight.delete(url)
        entry.controller.abort()
      }
    }
    signal.addEventListener('abort', onAbort, { once: true })
    entry.read.then(
      (res) => {
        signal.removeEventListener('abort', onAbort)
        resolve(res.clone())
      },
      (e: unknown) => {
        signal.removeEventListener('abort', onAbort)
        reject(e instanceof Error ? e : new TypeError(String(e)))
      },
    )
  })
}

export function resetSharedGetForTests(): void {
  inflight.clear()
  queues.clear()
  batching = false
}
