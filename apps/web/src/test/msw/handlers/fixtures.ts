import { http, HttpResponse, type AnyHandler } from 'msw'
import { loadHttpFixture, loadStreamFixture } from '../../fixtures/load'

const misses: string[] = []

/** Requests for a fixtured source that had no recording, since the last `takeFixtureMisses()`. */
export function takeFixtureMisses(): string[] {
  return misses.splice(0)
}

const PE_ORIGINS = ['https://api.pe.dashhq.org', 'https://api.testnet.pe.dashhq.org']

function serve(method: 'GET' | 'POST') {
  return async ({ request }: { request: Request }): Promise<Response> => {
    const url = request.url
    if (method === 'GET' && new URL(url).pathname.endsWith('/stream')) {
      const stream = await loadStreamFixture(url)
      if (stream) {
        return new HttpResponse(stream, { headers: { 'content-type': 'application/x-ndjson' } })
      }
    }
    const fixture = await loadHttpFixture(url, method)
    if (!fixture) {
      misses.push(`${method} ${url}`)
      return HttpResponse.error()
    }
    const headers = new Headers(fixture.headers)
    if (!headers.has('content-type')) headers.set('content-type', 'application/json')
    return new HttpResponse(JSON.stringify(fixture.body), { status: fixture.status, headers })
  }
}

function forOrigin(pattern: string): AnyHandler[] {
  return [http.get(pattern, serve('GET')), http.post(pattern, serve('POST'))]
}

export const radarHandlers = forOrigin('https://radar.dashhq.org/api/v1/*')
export const peHandlers = PE_ORIGINS.flatMap((o) => forOrigin(`${o}/*`))
export const hyphenHandlers = forOrigin('*/x/hy/*')
