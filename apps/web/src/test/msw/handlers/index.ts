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

export const fixtureHandlers: AnyHandler[] = [
  hyphenBatch,
  ...radarHandlers,
  ...peHandlers,
  ...hyphenHandlers,
  ...insightHandlers,
]
