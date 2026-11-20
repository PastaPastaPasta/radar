import { earlyAnswers } from './early'

/** The element the edge Worker adds to a tx or block page with the Hyphen answers that page reads first (`workers/edge/src/first-data.ts`). */
export const FIRST_DATA_ELEMENT_ID = 'radar-first-data'

/** The edge read them through the pass-through, whose cache keeps a list 15 s; past that the page reads again. */
export const FIRST_DATA_MAX_AGE_MS = 15_000

let reads: Map<string, unknown> | undefined
let readAt = 0

function parse(doc: Document): Map<string, unknown> {
  const el = doc.getElementById(FIRST_DATA_ELEMENT_ID)
  const out = new Map<string, unknown>()
  if (!el?.textContent) return out
  try {
    const parsed = JSON.parse(el.textContent) as { reads?: unknown }
    if (parsed.reads && typeof parsed.reads === 'object') {
      for (const [path, body] of Object.entries(parsed.reads)) {
        if (path.startsWith('/x/hy/')) out.set(path, body)
      }
    }
  } catch {
    // A page without readable first data reads Hyphen itself.
  }
  el.remove()
  return out
}

/**
 * The body the edge inlined for this same-origin GET, as the response the pass-through gave it, or undefined. Each
 * read answers from it while it is fresh; later reads go to the network. An early answer (§4.7): fixture builds and
 * page tests ask exactly what they recorded.
 */
export function firstDataResponse(url: string, now = Date.now()): Response | undefined {
  if (!earlyAnswers() || typeof document === 'undefined') return undefined
  if (!reads) {
    reads = parse(document)
    readAt = now
  }
  if (reads.size === 0) return undefined
  if (now - readAt > FIRST_DATA_MAX_AGE_MS) {
    reads.clear()
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
  if (!reads.has(key)) return undefined
  return new Response(JSON.stringify(reads.get(key)), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

export function resetFirstDataForTests(): void {
  reads = undefined
  readAt = 0
}
