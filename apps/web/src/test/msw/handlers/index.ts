import { http, HttpResponse, type AnyHandler } from 'msw'
import type { BatchResult } from '@/data/shared-get'
import { hyphenHandlers, insightHandlers, peHandlers, radarHandlers } from './fixtures'

export {
  addPlatformBlocks,
  HTTP_SOURCE_PATTERNS,
  onFixtureMiss,
  takeFixtureMisses,
} from './fixtures'

/** The edge's Hyphen batch, answered read by read from the same recordings (`workers/edge/src/proxy.ts`). */
const hyphenBatch = http.get('*/x/hy/:net/batch', async ({ request, params }) => {
  const url = new URL(request.url)
  const results = await Promise.all(
    url.searchParams.getAll('r').map(async (path): Promise<BatchResult> => {
      const res = await fetch(new URL(`/x/hy/${String(params.net)}/${path}`, url))
      const text = await res.text()
      let body: unknown = null
      try {
        body = text ? JSON.parse(text) : null
      } catch {
        body = null
      }
      return { status: res.status, body }
    }),
  )
  return HttpResponse.json({ results })
})

const PE_BASE: Record<string, string> = {
  mainnet: 'https://api.pe.dashhq.org',
  testnet: 'https://api.testnet.pe.dashhq.org',
}

/** Where a `/x/batch` read goes on its own (`workers/edge/src/batch.ts`). */
function batchReadUrl(read: string, origin: URL): string | null {
  const [source, ...rest] = read.split('/')
  if (source === 'hy') return new URL(`/x/hy/${rest.join('/')}`, origin).href
  if (source === 'radar') return `https://radar.dashhq.org/api/v1/${rest.join('/')}`
  const net = rest[0] ?? ''
  const base = source === 'pe' && Object.hasOwn(PE_BASE, net) ? PE_BASE[net] : undefined
  return base ? `${base}/${rest.slice(1).join('/')}` : null
}

/**
 * The edge's cross-source batch (NDJSON, one line per read), answered read by read from the same recordings and
 * handlers, so a source a test refuses fails only its own reads. A probe (`p`) keeps its tag, which the fixture layer counts apart from page reads.
 */
const sourcesBatch = http.get('*/x/batch', async ({ request }) => {
  const url = new URL(request.url)
  const probes = new Set(url.searchParams.getAll('p'))
  const results = await Promise.all(
    url.searchParams.getAll('r').map(async (read, n): Promise<BatchResult> => {
      const target = batchReadUrl(read, url)
      if (!target) return { status: 400, body: { error: 'not_batched' } }
      try {
        const res = await fetch(`${target}${probes.has(String(n)) ? '#radar-probe' : ''}`)
        const text = await res.text()
        let body: unknown = null
        try {
          body = text ? JSON.parse(text) : null
        } catch {
          body = null
        }
        return { status: res.status, body }
      } catch {
        return { status: 502, body: { error: 'upstream_unavailable' } }
      }
    }),
  )
  return new HttpResponse(results.map((r, i) => `${JSON.stringify({ i, ...r })}\n`).join(''), {
    headers: { 'content-type': 'application/x-ndjson' },
  })
})

export const fixtureHandlers: AnyHandler[] = [
  sourcesBatch,
  hyphenBatch,
  ...radarHandlers,
  ...peHandlers,
  ...hyphenHandlers,
  ...insightHandlers,
]
