import {
  HYPHEN_API_BASE,
  resolveHyphenRequest,
  UPSTREAM_USER_AGENT,
  type HyphenNetwork,
} from './hyphen-path'
import { handleProxy } from './proxy'

/** The HTML never waits longer than this for the edge cache; past it the page reads Hyphen itself. */
export const FIRST_DATA_BUDGET_MS = 100
/** A block this close to the tip may still be reorganised away, so nothing in it is inlined. */
export const REORG_DEPTH = 6
export const FIRST_DATA_ELEMENT_ID = 'radar-first-data'
/**
 * Raw bytes named by their hash never change. The rest of a settled tx or block (its tip height, lock tags) moves
 * slowly, is stamped with the height it is as of, and is replaced by DAPI's answer within seconds of the page opening.
 */
const IMMUTABLE_TTL_SECONDS = 86_400
const READ_TTL_SECONDS = 60
/** Hyphen's 404 is kept this long, so a stream of visits to an id it lacks does not become a stream of reads. */
const MISSING_TTL_SECONDS = 60
/**
 * Platform Explorer's DASH price, which every page reads right after its first paint. Inlined from the edge cache, it
 * is one request fewer against the zone's rate limit on every cold page; it moves slowly, and the page's own
 * refresh reads it live.
 */
export const RATE_URL = 'https://api.pe.dashhq.org/rate'
const RATE_TTL_SECONDS = 120
const RATE_KEY = `${RATE_URL}#radar-first-data`
const FETCHED_AT = 'x-radar-fetched-at'
const MISSING = 'x-radar-missing'

const TXID = /^[0-9a-f]{64}$/i
const BLOCK_HEIGHT = /^\d{1,9}$/

export interface FirstDataPlan {
  net: HyphenNetwork
  kind: 'tx' | 'block'
  /** The id as the page asks Hyphen for it: a lowercased hash, or a height. */
  id: string
}

/** The Hyphen reads the page at `url` starts with, when it is a tx or a block and Hyphen is a source it reads. */
export function firstDataPlan(url: URL): FirstDataPlan | null {
  if (url.searchParams.get('sources') === 'decentralized') return null
  const network = url.searchParams.get('network') ?? url.searchParams.get('net') ?? 'mainnet'
  if (!Object.hasOwn(HYPHEN_API_BASE, network)) return null
  const net = network as HyphenNetwork
  const m = /^\/(tx|block)\/([^/]+)\/?$/.exec(url.pathname)
  if (!m) return null
  const kind = m[1] as 'tx' | 'block'
  const id = m[2]!
  if (TXID.test(id)) return { net, kind, id: id.toLowerCase() }
  return kind === 'block' && BLOCK_HEIGHT.test(id) ? { net, kind, id: String(Number(id)) } : null
}

/** One inlined read: the body the pass-through returned, and when the edge read it from Hyphen (ms epoch). */
export interface FirstRead {
  body: unknown
  fetchedAt: number
}

export interface FirstData {
  /** When the edge built this page (ms epoch); the page uses none of it once that is older than its window. */
  at: number
  /** Same-origin `/x/hy/…` paths, each with the read the pass-through returned for it, and `RATE_URL`. */
  reads: Record<string, FirstRead>
}

type Json = Record<string, unknown>

interface Ctx {
  waitUntil(promise: Promise<unknown>): void
}

const edgeCache = (): Cache | undefined =>
  typeof caches === 'undefined' ? undefined : caches.default

/** The pass-through's own mapping of a read, which also says whether it can ever change. */
function upstream(origin: string, path: string) {
  const url = new URL(origin + path)
  const resolved = resolveHyphenRequest(url.pathname, '')
  return resolved.ok
    ? {
        url,
        key: new Request(`${resolved.url.href}#radar-first-data`),
        immutable: resolved.immutable,
      }
    : null
}

type Cached = { read: FirstRead } | { missing: true } | null

/** What the edge cache holds for this read (an answer, or Hyphen's recent "not found"), without asking Hyphen. */
async function cached(origin: string, path: string): Promise<Cached> {
  const up = upstream(origin, path)
  const hit = up
    ? await edgeCache()
        ?.match(up.key)
        .catch(() => undefined)
    : undefined
  if (!hit) return null
  if (hit.headers.has(MISSING)) return { missing: true }
  const body = await hit.json<Json>().catch(() => null)
  const fetchedAt = Number(hit.headers.get(FETCHED_AT))
  return body && fetchedAt > 0 ? { read: { body, fetchedAt } } : null
}

/**
 * Reads Hyphen through the pass-through after the response has gone, and keeps a JSON 200 (or, for a while, a 404) in
 * the edge cache for the next visit: Hyphen's own zone does not let a Worker's subrequest cache its answers.
 */
function warm(origin: string, path: string, ctx: Ctx): void {
  const up = upstream(origin, path)
  const cache = edgeCache()
  if (!up || !cache) return
  const work = async () => {
    const res = await handleProxy(new Request(up.url), up.url)
    if (res.status === 404) {
      res.body?.cancel().catch(() => undefined)
      const headers = { 'cache-control': `public, max-age=${MISSING_TTL_SECONDS}`, [MISSING]: '1' }
      return cache.put(up.key, new Response(null, { headers }))
    }
    if (res.status !== 200) return res.body?.cancel()
    const body = await res.json<Json>()
    const ttl = up.immutable ? IMMUTABLE_TTL_SECONDS : READ_TTL_SECONDS
    const headers = { 'cache-control': `public, max-age=${ttl}`, [FETCHED_AT]: String(Date.now()) }
    await cache.put(up.key, Response.json(body, { headers }))
  }
  ctx.waitUntil(work().catch(() => undefined))
}

const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined)

/** Hyphen's answer names its own tip (`asOfHeight`); a height that deep below it is not expected to move. */
const settled = (detail: Json): boolean => {
  const height = num(detail.blockHeight)
  const tip = num(detail.asOfHeight)
  return height !== undefined && tip !== undefined && tip - height >= REORG_DEPTH
}

interface Options {
  /** Whether a miss is fetched for the next visit: only a person's own navigation does. */
  warm: boolean
}

/** Each read from the edge cache, warming the ones it lacks for the next visit. */
async function fromCache(
  origin: string,
  paths: string[],
  ctx: Ctx,
  opts: Options,
): Promise<(FirstRead | null)[]> {
  const found = await Promise.all(paths.map((p) => cached(origin, p)))
  paths.forEach((p, i) => {
    if (!found[i] && opts.warm) warm(origin, p, ctx)
  })
  return found.map((f) => (f && 'read' in f ? f.read : null))
}

async function gather(
  origin: string,
  plan: FirstDataPlan,
  deadline: Promise<null>,
  ctx: Ctx,
  opts: Options,
): Promise<FirstData | null> {
  const base = `/x/hy/${plan.net}`
  const paths =
    plan.kind === 'tx'
      ? [`${base}/rawtx/${plan.id}`, `${base}/tx/${plan.id}`, `${base}/status`]
      : [`${base}/rawblock/${plan.id}`, `${base}/block/${plan.id}`, `${base}/status`]
  const found = await Promise.race([fromCache(origin, paths, ctx, opts), deadline])
  if (!found) return null
  const [raw, detail, status] = found
  const d = (detail?.body ?? null) as Json | null
  if (!raw || !detail || !d || !settled(d)) return null
  if (plan.kind === 'block' && d.orphanedAt != null) return null
  const reads: Record<string, FirstRead> = { [paths[0]!]: raw, [paths[1]!]: detail }
  if (status) reads[paths[2]!] = status
  if (plan.kind === 'tx') {
    // The tx page also reads its block for the time.
    const blockPath = `${base}/block/${num(d.blockHeight)}`
    const [block] = (await Promise.race([fromCache(origin, [blockPath], ctx, opts), deadline])) ?? [
      null,
    ]
    if (block) reads[blockPath] = block
  }
  return { at: Date.now(), reads }
}

/** The price from the edge cache, warming it for the next visit when it is not there. */
async function rateRead(ctx: Ctx, opts: Options): Promise<FirstRead | null> {
  const cache = edgeCache()
  if (!cache) return null
  const key = new Request(RATE_KEY)
  const hit = await cache.match(key).catch(() => undefined)
  const fetchedAt = Number(hit?.headers.get(FETCHED_AT))
  const body = hit && fetchedAt > 0 ? await hit.json<Json>().catch(() => null) : null
  if (body) return { body, fetchedAt }
  if (opts.warm) {
    const work = async () => {
      const res = await fetch(RATE_URL, {
        headers: { accept: 'application/json', 'user-agent': UPSTREAM_USER_AGENT },
      })
      const rate = res.ok ? await res.json<Json>().catch(() => null) : null
      if (typeof rate?.usd !== 'number') return res.body?.cancel()
      const headers = {
        'cache-control': `public, max-age=${RATE_TTL_SECONDS}`,
        [FETCHED_AT]: String(Date.now()),
      }
      await cache.put(key, Response.json(rate, { headers }))
    }
    ctx.waitUntil(work().catch(() => undefined))
  }
  return null
}

/**
 * What the page would read first, from the edge cache: the price on every page, and on a tx or block page the Hyphen
 * answers it starts with, or none of them when the tx and its bytes (or the block and its bytes) are not both there
 * within `budgetMs`, the tx is unconfirmed or the block is within `REORG_DEPTH` of Hyphen's tip. Null when there is
 * nothing to inline. A miss warms the cache for the next visit after the response has gone, so the HTML never waits
 * for an upstream itself.
 */
export async function fetchFirstData(
  origin: string,
  plan: FirstDataPlan | null,
  ctx: Ctx,
  { budgetMs = FIRST_DATA_BUDGET_MS, warm = true }: { budgetMs?: number; warm?: boolean } = {},
): Promise<FirstData | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), budgetMs)
  })
  try {
    const [hyphen, rate] = await Promise.all([
      plan ? gather(origin, plan, deadline, ctx, { warm }).catch(() => null) : null,
      Promise.race([rateRead(ctx, { warm }), deadline]).catch(() => null),
    ])
    const reads = { ...hyphen?.reads, ...(rate ? { [RATE_URL]: rate } : {}) }
    return Object.keys(reads).length > 0 ? { at: hyphen?.at ?? Date.now(), reads } : null
  } finally {
    clearTimeout(timer)
  }
}

/** The JSON as a script element no browser runs and no `</script>` inside it can end early. */
export function firstDataTag(data: FirstData): string {
  const json = JSON.stringify(data).replace(/</g, '\\u003c')
  return `<script type="application/json" id="${FIRST_DATA_ELEMENT_ID}">${json}</script>`
}

/** Adds the first data at the end of the body. The page now differs from the stored shell, so its validators go. */
export function withFirstData(res: Response, data: FirstData | null): Response {
  if (!data) return res
  const tag = firstDataTag(data)
  const out = new Response(res.body, res)
  out.headers.delete('etag')
  out.headers.delete('last-modified')
  return new HTMLRewriter()
    .on('body', { element: (el) => void el.append(tag, { html: true }) })
    .transform(out)
}

/** Crawlers the link-preview pattern (`bot|crawler|spider|…`) does not already name. */
const OTHER_CRAWLERS = /slurp|ia_archiver|archive\.org|yandex|baiduspider|petalsearch|seznam/i

export function isCrawler(userAgent: string | null): boolean {
  return userAgent !== null && OTHER_CRAWLERS.test(userAgent)
}

/** A person's own navigation to the page, the only request worth reading Hyphen ahead for. */
export function isNavigation(request: Request): boolean {
  return (
    request.headers.get('sec-fetch-mode') === 'navigate' ||
    request.headers.get('sec-fetch-dest') === 'document'
  )
}
