import { earlyAnswers } from './early'

/** The element the edge Worker adds to a tx or block page with the Hyphen answers that page reads first (`workers/edge/src/first-data.ts`). */
export const FIRST_DATA_ELEMENT_ID = 'radar-first-data'

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
      if (path.startsWith('/x/hy/') && r?.body !== undefined && isTime(r.fetchedAt)) {
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
 * The answer the edge inlined for this same-origin GET, or undefined. Each answers one read, within
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
    if (u.origin !== location.origin) return undefined
    key = u.pathname + u.search
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
