import { withSecurityHeaders } from './headers'
import { genericOg, isLinkPreviewAgent, matchOgRoute, resolveOg, rewriteHead } from './og'
import { handleProxy, isProxyPath } from './proxy'
import { redirectFor } from './redirects'

export interface Env {
  ASSETS: Fetcher
  NATIVE_HOSTS?: string
}

const STATIC_FILE =
  /\.(js|mjs|css|map|json|png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|otf|wasm|txt|xml|webmanifest)$/i

async function serveAssets(request: Request, env: Env, url: URL): Promise<Response> {
  const res = await env.ASSETS.fetch(request)
  if (res.status !== 404 || (request.method !== 'GET' && request.method !== 'HEAD')) return res
  if (STATIC_FILE.test(url.pathname)) return res
  return env.ASSETS.fetch(new Request(new URL('/', url), request))
}

const SERVICE_WORKER_PATH = '/sw.js'

/** A worker script must be served as JavaScript, and browsers must be able to check it for a new version on every visit. */
function asServiceWorker(res: Response): Response {
  const out = new Response(res.body, res)
  out.headers.set('content-type', 'text/javascript; charset=utf-8')
  out.headers.set('cache-control', 'no-cache')
  return out
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
  const redirect = redirectFor(url, { nativeHosts })
  if (redirect) {
    return new Response(null, {
      status: redirect.permanent ? 301 : 302,
      headers: {
        location: redirect.location,
        'cache-control': redirect.permanent ? 'public, max-age=300' : 'no-store',
      },
    })
  }

  const res = await serveAssets(request, env, url)
  if (url.pathname === SERVICE_WORKER_PATH && res.ok) return asServiceWorker(res)

  const og = matchOgRoute(url)
  const isHtml = res.headers.get('content-type')?.startsWith('text/html') === true
  if (og && res.ok && isHtml && request.method === 'GET') {
    const out = new Response(res.body, res)
    out.headers.append('vary', 'user-agent')
    const network = url.searchParams.get('network')
    const decentralized = url.searchParams.get('sources') === 'decentralized'
    const preview = isLinkPreviewAgent(request.headers.get('user-agent')) && !decentralized
    const meta = preview ? await resolveOg(og, network) : genericOg(og.kind)
    const query = [
      ...Object.entries(og.search ?? {}).map(([k, v]) => `${k}=${encodeURIComponent(v)}`),
      network && `network=${encodeURIComponent(network)}`,
      decentralized && 'sources=decentralized',
    ].filter(Boolean)
    const canonical = `${url.origin}${url.pathname}${query.length ? `?${query.join('&')}` : ''}`
    return rewriteHead(out, meta, canonical)
  }
  return res
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return withSecurityHeaders(await handle(request, env))
  },
} satisfies ExportedHandler<Env>
