import { HYPHEN_API_BASE, resolveHyphenRequest, type HyphenNetwork } from './hyphen-path'
import { handleProxy } from './proxy'

/** The HTML never waits longer than this for the page's first data; past it the page reads Hyphen itself. */
export const FIRST_DATA_BUDGET_MS = 300
/** A block this close to the tip may still be reorganised away, so nothing in it is inlined. */
export const REORG_DEPTH = 6
export const FIRST_DATA_ELEMENT_ID = 'radar-first-data'
/**
 * Raw bytes named by their hash never change. The rest of a settled tx or block (its tip height, lock tags) moves
 * slowly, is stamped with the height it is as of, and is replaced by DAPI's answer within seconds of the page opening.
 */
const IMMUTABLE_TTL_SECONDS = 86_400
const READ_TTL_SECONDS = 60

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

export interface FirstData {
  /** Same-origin `/x/hy/…` paths, each with the JSON body the pass-through returned for it. */
  reads: Record<string, unknown>
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

/** What the edge cache holds for this read, without asking Hyphen. */
async function cached(origin: string, path: string): Promise<Json | null> {
  const up = upstream(origin, path)
  const hit = up
    ? await edgeCache()
        ?.match(up.key)
        .catch(() => undefined)
    : undefined
  return hit ? hit.json<Json>().catch(() => null) : null
}

/**
 * Reads Hyphen through the pass-through after the response has gone, and keeps a JSON 200 in the edge cache for the
 * next visit: Hyphen's own zone does not let a Worker's subrequest cache its answers.
 */
function warm(origin: string, path: string, ctx: Ctx): void {
  const up = upstream(origin, path)
  const cache = edgeCache()
  if (!up || !cache) return
  const ttl = up.immutable ? IMMUTABLE_TTL_SECONDS : READ_TTL_SECONDS
  const work = async () => {
    const res = await handleProxy(new Request(up.url), up.url)
    if (res.status !== 200) return res.body?.cancel()
    const body = await res.json<Json>()
    const headers = { 'cache-control': `public, max-age=${ttl}` }
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

/** Each read from the edge cache, warming the ones it lacks for the next visit. */
async function fromCache(origin: string, paths: string[], ctx: Ctx): Promise<(Json | null)[]> {
  const found = await Promise.all(paths.map((p) => cached(origin, p)))
  paths.forEach((p, i) => {
    if (!found[i]) warm(origin, p, ctx)
  })
  return found
}

async function gather(
  origin: string,
  plan: FirstDataPlan,
  deadline: Promise<null>,
  ctx: Ctx,
): Promise<FirstData | null> {
  const base = `/x/hy/${plan.net}`
  const paths =
    plan.kind === 'tx'
      ? [`${base}/rawtx/${plan.id}`, `${base}/tx/${plan.id}`, `${base}/status`]
      : [`${base}/rawblock/${plan.id}`, `${base}/block/${plan.id}`, `${base}/status`]
  const found = await Promise.race([fromCache(origin, paths, ctx), deadline])
  if (!found) return null
  const [raw, detail, status] = found
  if (!raw || !detail || !settled(detail)) return null
  if (plan.kind === 'block' && detail.orphanedAt != null) return null
  const reads: Record<string, unknown> = { [paths[0]!]: raw, [paths[1]!]: detail }
  if (status) reads[paths[2]!] = status
  if (plan.kind === 'tx') {
    // The tx page also reads its block for the time.
    const blockPath = `${base}/block/${num(detail.blockHeight)}`
    const [block] = (await Promise.race([fromCache(origin, [blockPath], ctx), deadline])) ?? [null]
    if (block) reads[blockPath] = block
  }
  return { reads }
}

/**
 * The Hyphen answers the page would read first, from the edge cache, or null when the tx and its bytes (or the block
 * and its bytes) are not both there within `budgetMs`, the tx is unconfirmed or the block is within `REORG_DEPTH` of
 * Hyphen's tip. A miss warms the cache for the next visit after the response has gone, so the HTML never waits for
 * Hyphen itself.
 */
export async function fetchFirstData(
  origin: string,
  plan: FirstDataPlan,
  ctx: Ctx,
  budgetMs = FIRST_DATA_BUDGET_MS,
): Promise<FirstData | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), budgetMs)
  })
  try {
    return await gather(origin, plan, deadline, ctx).catch(() => null)
  } finally {
    clearTimeout(timer)
  }
}

/** The JSON as a script element no browser runs and no `</script>` inside it can end early. */
export function firstDataTag(data: FirstData): string {
  const json = JSON.stringify(data).replace(/</g, '\\u003c')
  return `<script type="application/json" id="${FIRST_DATA_ELEMENT_ID}">${json}</script>`
}

/** Adds the first data at the end of the body. */
export function withFirstData(res: Response, data: FirstData | null): Response {
  if (!data) return res
  const tag = firstDataTag(data)
  return new HTMLRewriter()
    .on('body', { element: (el) => void el.append(tag, { html: true }) })
    .transform(res)
}
