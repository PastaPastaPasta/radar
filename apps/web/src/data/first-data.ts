import { earlyAnswers } from './early'

/**
 * The element the edge Worker adds to a page with the answers it reads first (`workers/edge/src/first-data.ts`): the
 * price on every page, and the Hyphen reads of a tx or block page.
 */
export const FIRST_DATA_ELEMENT_ID = 'radar-first-data'
/** Platform Explorer's price, the one read from another origin the edge inlines (`RATE_URL` there). */
export const FIRST_DATA_RATE_URL = 'https://api.pe.dashhq.org/rate'

/**
 * How long after the edge built the page its inlined answers stand in for a read. A tab restored later, or the page
 * served again from an HTTP cache, reads the network instead.
 */
export const FIRST_DATA_MAX_AGE_MS = 15_000

interface Inlined {
  /** When the edge built the page (ms epoch). */
  at: number
  reads: Map<string, { body: unknown; fetchedAt: number }>
}

let inlined: Inlined | undefined

const isTime = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0

function parse(doc: Document): Inlined {
  const el = doc.getElementById(FIRST_DATA_ELEMENT_ID)
  const out: Inlined = { at: 0, reads: new Map() }
  if (!el?.textContent) return out
  el.remove()
  try {
    const parsed = JSON.parse(el.textContent) as { at?: unknown; reads?: unknown }
    if (!isTime(parsed.at) || !parsed.reads || typeof parsed.reads !== 'object') return out
    out.at = parsed.at
    for (const [path, read] of Object.entries(parsed.reads as Record<string, unknown>)) {
      const r = read as { body?: unknown; fetchedAt?: unknown } | null
      const known = path.startsWith('/x/hy/') || path === FIRST_DATA_RATE_URL
      if (known && r?.body !== undefined && isTime(r.fetchedAt)) {
        out.reads.set(path, { body: r.body, fetchedAt: r.fetchedAt })
      }
    }
  } catch {
    // A page without readable first data reads Hyphen itself.
  }
  return out
}

/** One inlined answer: the response the pass-through gave the edge, and when the edge read it from Hyphen. */
export interface FirstDataAnswer {
  response: Response
  fetchedAt: number
}

/**
 * The answer the edge inlined for this GET (a same-origin Hyphen read, or the price), or undefined. Each answers one read, within
 * `FIRST_DATA_MAX_AGE_MS` of when the edge built the page; later reads, and reads after that, go to the network. An
 * early answer (§4.7): fixture builds and page tests ask exactly what they recorded.
 */
export function firstDataAnswer(url: string, now = Date.now()): FirstDataAnswer | undefined {
  if (!earlyAnswers() || typeof document === 'undefined') return undefined
  inlined ??= parse(document)
  if (inlined.reads.size === 0) return undefined
  if (Math.abs(now - inlined.at) > FIRST_DATA_MAX_AGE_MS) {
    inlined.reads.clear()
    return undefined
  }
  let key: string
  try {
    const u = new URL(url, location.href)
    key = u.origin === location.origin ? u.pathname + u.search : u.href
  } catch {
    return undefined
  }
  const read = inlined.reads.get(key)
  if (!read) return undefined
  inlined.reads.delete(key)
  return {
    response: new Response(JSON.stringify(read.body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
    fetchedAt: read.fetchedAt,
  }
}

export function resetFirstDataForTests(): void {
  inlined = undefined
}
