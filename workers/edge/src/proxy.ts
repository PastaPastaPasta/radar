const UPSTREAM: Record<string, string> = {
  mainnet: 'https://hy.kw.vg/api/v1/',
  testnet: 'https://ts.kw.vg/api/v1/',
}

const FORWARD_REQUEST = ['accept', 'if-none-match']
const KEEP_RESPONSE = ['content-type', 'etag', 'last-modified', 'content-language', 'vary']
const LIST_TTL_SECONDS = 15
const UPSTREAM_TIMEOUT_MS = 10_000

const UNSAFE_PATH = /%2f|%5c|\\|(^|\/)(\.|%2e){1,2}(\/|$)/i

const PREFIX = /^\/x\/hy\/(mainnet|testnet)\/(.*)$/

export function isProxyPath(pathname: string): boolean {
  return pathname.startsWith('/x/hy/')
}

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store', ...headers } })
}

export async function handleProxy(request: Request, url: URL): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return json(405, { error: 'method_not_allowed' }, { allow: 'GET, HEAD' })
  }
  const m = PREFIX.exec(url.pathname)
  const base = m?.[1] ? UPSTREAM[m[1]] : undefined
  if (!m || !base) return json(404, { error: 'unknown_network' })

  if (UNSAFE_PATH.test(m[2] ?? '')) return json(400, { error: 'bad_path' })

  const target = new URL(m[2] ?? '', base)
  if (!target.pathname.startsWith(new URL(base).pathname) || target.host !== new URL(base).host) {
    return json(400, { error: 'bad_path' })
  }
  target.search = url.search

  const headers = new Headers()
  for (const name of FORWARD_REQUEST) {
    const v = request.headers.get(name)
    if (v) headers.set(name, v)
  }

  const isStream = target.pathname === new URL(base).pathname + 'stream'
  let upstream: Response
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      signal: isStream ? undefined : AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      cf: isStream
        ? { cacheTtl: 0, cacheEverything: false }
        : {
            cacheEverything: true,
            cacheTtlByStatus: { '200-299': LIST_TTL_SECONDS, '300-499': 0, '500-599': 0 },
          },
    })
  } catch {
    return json(502, { error: 'upstream_unavailable' })
  }

  const out = new Headers()
  for (const name of KEEP_RESPONSE) {
    const v = upstream.headers.get(name)
    if (v) out.set(name, v)
  }
  if (isStream) {
    out.set('cache-control', 'no-store')
    out.set('x-accel-buffering', 'no')
  } else if (upstream.ok) {
    out.set('cache-control', `public, max-age=${LIST_TTL_SECONDS}`)
  } else {
    out.set('cache-control', 'no-store')
  }
  return new Response(request.method === 'HEAD' ? null : upstream.body, {
    status: upstream.status,
    headers: out,
  })
}
