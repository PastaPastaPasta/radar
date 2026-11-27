/**
 * Every hosted read goes out through here. Two callers asking for the same URL while it is in flight share one request,
 * and Hyphen, Radar and Platform Explorer reads asked within a few milliseconds of each other go to the edge as one
 * (`/x/batch`, which `workers/edge/src/batch.ts` answers): a page's first dozen reads cost the zone's rate limit one
 * request. Each caller keeps its own timeout and cancellation (`readSourced` also holds the body read to them); a
 * shared read ends when the last caller waiting on it gives up.
 */

/** As many as the edge answers in one batch (`HYPHEN_BATCH_MAX` in `workers/edge/src/proxy.ts`). */
export const HYPHEN_BATCH_MAX = 16
const BATCH_WINDOW_MS = 4
/** Well under Cloudflare's 16 KB URL limit; a longer batch goes out early. */
const BATCH_MAX_QUERY = 6_000
/** Ends a read that every caller has stopped watching without cancelling it; callers' own timers are far shorter. */
const SHARED_CAP_MS = 60_000
const HYPHEN_READ = /^(https?:\/\/[^/]+)\/x\/hy\/((?:mainnet|testnet)\/.+)$/
/** The census API and Platform Explorer, which the edge reads for a batch (`RADAR_API` and `PE_API` there). */
const RADAR_READ = /^https:\/\/radar\.dashhq\.org\/api\/v1\/(.+)$/
const PE_READ = /^https:\/\/api\.(testnet\.)?pe\.dashhq\.org\/(.+)$/
/** Bytes named by their hash, which the browser keeps a day on their own (`immutable`); a batch is never kept. */
const IMMUTABLE_READ = /^raw(?:tx|block)\/[0-9a-f]{64}$/i
const ACCEPT = { accept: 'application/json' }

export interface BatchResult {
  status: number
  body: unknown
  headers?: Record<string, string>
}

let batching = false
/** Origins whose edge has no batch endpoint (a dev server), learnt from its first 404. */
const unbatched = new Set<string>()

/** Batches hosted reads from now on; the app turns it on at start (`main.tsx`), tests that count requests leave it off. */
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
  /** The fixture layer's tag (`#radar-probe`), kept on a read sent alone and on a batch of nothing but probes. */
  fragment: string
  signal: AbortSignal
  resolve: (res: Response) => void
  reject: (e: unknown) => void
}

interface Queue {
  items: Queued[]
  query: number
  sent: boolean
  timer?: ReturnType<typeof setTimeout>
}

const queues = new Map<string, Queue>()

const cancelled = () => new DOMException('The read was cancelled', 'AbortError')

/** A fetch that `signal` cancels, body included, and that ends on its own after `SHARED_CAP_MS`. */
async function single(url: string, signal: AbortSignal): Promise<Response> {
  if (signal.aborted) throw cancelled()
  const controller = new AbortController()
  const stop = () => controller.abort()
  const timer = setTimeout(stop, SHARED_CAP_MS)
  signal.addEventListener('abort', stop, { once: true })
  try {
    return await fetch(url, { headers: ACCEPT, signal: controller.signal })
  } catch (e) {
    clearTimeout(timer)
    signal.removeEventListener('abort', stop)
    throw e
  }
}

function answer({ status, body, headers }: BatchResult): Response {
  const bodyless = status === 204 || status === 205 || status === 304
  return new Response(bodyless ? null : JSON.stringify(body ?? null), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

const alone = (i: Queued) => single(`${i.url}${i.fragment}`, i.signal).then(i.resolve, i.reject)

async function flush(base: string, queue: Queue): Promise<void> {
  if (queue.sent) return
  queue.sent = true
  clearTimeout(queue.timer)
  if (queues.get(base) === queue) queues.delete(base)
  const items = queue.items.filter((i) => {
    if (i.signal.aborted) i.reject(cancelled())
    return !i.signal.aborted
  })
  if (items.length === 0) return
  if (items.length === 1) return void alone(items[0]!)
  // `p` names the probes, which the fixture layer tells apart from a page's reads; the edge reads only `r`.
  const query = [
    ...items.map((i) => `r=${encodeURIComponent(i.path)}`),
    ...items.flatMap((i, n) => (i.fragment ? [`p=${n}`] : [])),
  ].join('&')
  const fragment = items.every((i) => i.fragment) ? items[0]!.fragment : ''
  // The batch ends early only when every read in it has been given up.
  const everyone = new AbortController()
  let left = items.length
  for (const i of items)
    i.signal.addEventListener('abort', () => --left === 0 && everyone.abort(), { once: true })
  try {
    const res = await single(`${base}/x/batch?${query}${fragment}`, everyone.signal)
    // An edge without the batch endpoint (a dev server's pass-through) answers 404: each read goes out alone.
    if (res.status === 404) {
      unbatched.add(base)
      for (const i of items) {
        if (i.signal.aborted) i.reject(cancelled())
        else void alone(i)
      }
      return
    }
    // A refused batch (the zone's 429 with its Retry-After, a 5xx) is each read's answer, read as it would be alone.
    if (!res.ok) {
      for (const i of items) i.resolve(res.clone())
      return
    }
    const { results } = (await res.json()) as { results?: BatchResult[] }
    items.forEach((item, n) => {
      const result = results?.[n]
      if (result) item.resolve(answer(result))
      else item.reject(new TypeError('The batch answer is missing a read'))
    })
  } catch (e) {
    for (const i of items) i.reject(e)
  }
}

function batched(base: string, item: Omit<Queued, 'resolve' | 'reject'>): Promise<Response> {
  return new Promise((resolve, reject) => {
    const cost = encodeURIComponent(item.path).length + 3
    let queue = queues.get(base)
    if (queue && queue.query + cost > BATCH_MAX_QUERY) void flush(base, queue)
    queue = queues.get(base)
    if (!queue) {
      const fresh: Queue = { items: [], query: 0, sent: false }
      queues.set(base, fresh)
      fresh.timer = setTimeout(() => void flush(base, fresh), BATCH_WINDOW_MS)
      queue = fresh
    }
    queue.items.push({ ...item, resolve, reject })
    queue.query += cost
    if (queue.items.length >= HYPHEN_BATCH_MAX) void flush(base, queue)
  })
}

/** Where a read can go in a batch: the edge's origin and the read as `/x/batch` names it, or null to send it alone. */
function batchRead(url: string): { base: string; path: string } | null {
  const hyphen = HYPHEN_READ.exec(url)
  if (hyphen) {
    const path = hyphen[2]!.slice(hyphen[2]!.indexOf('/') + 1)
    if (path.startsWith('stream') || IMMUTABLE_READ.test(path)) return null
    return { base: hyphen[1]!, path: `hy/${hyphen[2]!}` }
  }
  const base = globalThis.location?.origin
  if (!base?.startsWith('http')) return null
  const radar = RADAR_READ.exec(url)
  if (radar) return { base, path: `radar/${radar[1]!}` }
  const pe = PE_READ.exec(url)
  if (pe) return { base, path: `pe/${pe[1] ? 'testnet' : 'mainnet'}/${pe[2]!}` }
  return null
}

function start(url: string, fragment: string, signal: AbortSignal) {
  const read = batching ? batchRead(url) : null
  if (read && !unbatched.has(read.base)) {
    return batched(read.base, { path: read.path, url, fragment, signal })
  }
  return single(`${url}${fragment}`, signal)
}

/**
 * A GET of `url` (absolute), shared with any other caller reading it right now. `fragment` tags the request for the
 * fixture layer (a health probe's `#radar-probe`) and is never sent; a probe still shares a read already in flight
 * and goes in a batch with the page's first reads, since either is a live answer from the source too. The read, body included, is cancelled once every caller
 * waiting on it has given up.
 */
export function sharedGet(
  url: string,
  { signal, fragment = '' }: { signal: AbortSignal; fragment?: string },
): Promise<Response> {
  if (signal.aborted) return Promise.reject(cancelled())
  let shared = inflight.get(url)
  if (!shared) {
    const controller = new AbortController()
    const read = start(url, fragment, controller.signal)
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
    // Kept past the headers: a caller that gives up while its body is still arriving lets go of the read too.
    signal.addEventListener(
      'abort',
      () => {
        reject(cancelled())
        if (--entry.waiting === 0) {
          if (inflight.get(url) === entry) inflight.delete(url)
          entry.controller.abort()
        }
      },
      { once: true },
    )
    entry.read.then(
      (res) => {
        if (!signal.aborted) resolve(res.clone())
      },
      (e: unknown) => reject(e instanceof Error ? e : new TypeError(String(e))),
    )
  })
}

/** `res.json()`, given up with an AbortError when `signal` aborts first (a caller's own timeout or cancellation). */
export function jsonUntil(res: Response, signal: AbortSignal): Promise<unknown> {
  if (signal.aborted) return Promise.reject(cancelled())
  return new Promise((resolve, reject) => {
    // The body itself stops when the last caller lets go of the shared read (`sharedGet`).
    const onAbort = () => reject(cancelled())
    signal.addEventListener('abort', onAbort, { once: true })
    res.json().then(
      (v: unknown) => {
        signal.removeEventListener('abort', onAbort)
        resolve(v)
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
  for (const q of queues.values()) clearTimeout(q.timer)
  queues.clear()
  unbatched.clear()
  batching = false
}
