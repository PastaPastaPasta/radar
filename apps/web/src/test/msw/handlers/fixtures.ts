import { http, HttpResponse, type AnyHandler } from 'msw'
import { loadHttpFixture, loadStreamFixture } from '../../fixtures/load'

const misses: string[] = []
let onMiss: ((request: string) => void) | undefined

/** Called for every request to a fixtured source with no recording, in addition to `takeFixtureMisses()`. */
export function onFixtureMiss(listener: ((request: string) => void) | undefined): void {
  onMiss = listener
}

/** Requests for a fixtured source that had no recording, since the last `takeFixtureMisses()`. */
export function takeFixtureMisses(): string[] {
  return misses.splice(0)
}

/** Records a request that had no recording, for every fixture transport (HTTP and DAPI alike). */
export function reportFixtureMiss(request: string): void {
  misses.push(request)
  onMiss?.(request)
}

const INSIGHT_ORIGINS = [
  'https://insight.dash.org/insight-api',
  'https://insight.testnet.networks.dash.org/insight-api',
]
const PE_ORIGINS = ['https://api.pe.dashhq.org', 'https://api.testnet.pe.dashhq.org']

let newPlatformBlocks = 0

/** From now on, PE's newest-blocks list answers with `n` more blocks on top than the recording holds. */
export function addPlatformBlocks(n: number): void {
  newPlatformBlocks = n
}

interface RecordedBlocks {
  resultSet: { header: { hash: string; height: number } }[]
}

function withNewBlocks(url: URL, body: unknown): unknown {
  const list = body as RecordedBlocks
  const top = list?.resultSet?.[0]
  if (newPlatformBlocks === 0 || url.pathname !== '/blocks' || !top) return body
  const newer = Array.from({ length: newPlatformBlocks }, (_, i) => ({
    ...top,
    header: {
      ...top.header,
      height: top.header.height + newPlatformBlocks - i,
      hash: (i + 1).toString(16).padStart(64, 'F'),
    },
  }))
  return { ...list, resultSet: [...newer, ...list.resultSet].slice(0, list.resultSet.length) }
}

function serve(method: 'GET' | 'POST') {
  return async ({ request }: { request: Request }): Promise<Response> => {
    // A probe's fragment tags the request; recordings are keyed without it.
    const parsed = new URL(request.url)
    parsed.hash = ''
    const url = parsed.toString()
    if (method === 'GET' && new URL(url).pathname.endsWith('/stream')) {
      const stream = await loadStreamFixture(url)
      if (stream) {
        return new HttpResponse(stream, { headers: { 'content-type': 'application/x-ndjson' } })
      }
    }
    const fixture = await loadHttpFixture(url, method)
    if (!fixture) {
      reportFixtureMiss(`${method} ${url}`)
      return HttpResponse.error()
    }
    const headers = new Headers(fixture.headers)
    if (!headers.has('content-type')) headers.set('content-type', 'application/json')
    const body = withNewBlocks(parsed, fixture.body)
    return new HttpResponse(JSON.stringify(body), { status: fixture.status, headers })
  }
}

function forOrigin(pattern: string): AnyHandler[] {
  return [http.get(pattern, serve('GET')), http.post(pattern, serve('POST'))]
}

/** The URL patterns each HTTP source answers on. */
export const HTTP_SOURCE_PATTERNS = {
  radar: ['https://radar.dashhq.org/api/v1/*'],
  pe: PE_ORIGINS.map((o) => `${o}/*`),
  hyphen: ['*/x/hy/*'],
  insight: INSIGHT_ORIGINS.map((o) => `${o}/*`),
} as const

export const radarHandlers = HTTP_SOURCE_PATTERNS.radar.flatMap(forOrigin)
export const peHandlers = HTTP_SOURCE_PATTERNS.pe.flatMap(forOrigin)
export const hyphenHandlers = HTTP_SOURCE_PATTERNS.hyphen.flatMap(forOrigin)
export const insightHandlers = HTTP_SOURCE_PATTERNS.insight.flatMap(forOrigin)
