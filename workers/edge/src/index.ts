import { withSecurityHeaders } from './headers'
import { matchOgRoute, resolveOg, rewriteHead } from './og'
import { handleProxy, isProxyPath } from './proxy'
import { redirectFor } from './redirects'

export interface Env {
  ASSETS: Fetcher
  NATIVE_HOSTS?: string
}

const HAS_EXTENSION = /\.[A-Za-z0-9]{1,8}$/

async function serveAssets(request: Request, env: Env, url: URL): Promise<Response> {
  const res = await env.ASSETS.fetch(request)
  if (res.status !== 404 || (request.method !== 'GET' && request.method !== 'HEAD')) return res
  if (HAS_EXTENSION.test(url.pathname)) return res
  return env.ASSETS.fetch(new Request(new URL('/', url), request))
}

async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)

  if (isProxyPath(url.pathname)) return handleProxy(request, url)

  if (url.pathname.startsWith('/api/v1/')) {
    return Response.json(
      { error: 'not_found' },
      { status: 404, headers: { 'cache-control': 'no-store' } },
    )
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return Response.json(
      { error: 'method_not_allowed' },
      { status: 405, headers: { allow: 'GET, HEAD' } },
    )
  }

  const nativeHosts = (env.NATIVE_HOSTS ?? '')
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean)
  const location = redirectFor(url, { nativeHosts })
  if (location)
    return new Response(null, {
      status: 301,
      headers: { location, 'cache-control': 'public, max-age=300' },
    })

  const res = await serveAssets(request, env, url)

  const og = matchOgRoute(url.pathname)
  const isHtml = res.headers.get('content-type')?.startsWith('text/html') === true
  if (og && res.ok && isHtml && request.method === 'GET') {
    const network = url.searchParams.get('network')
    const meta = await resolveOg(og.kind, og.id, network)
    const canonical = `${url.origin}${url.pathname}${network ? `?network=${encodeURIComponent(network)}` : ''}`
    return rewriteHead(res, meta, canonical)
  }
  return res
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return withSecurityHeaders(await handle(request, env))
  },
} satisfies ExportedHandler<Env>
