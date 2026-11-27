import { fetchFirstData, firstDataPlan, isCrawler, isNavigation, withFirstData } from './first-data'
import { withSecurityHeaders } from './headers'
import {
  genericOg,
  isLinkPreviewAgent,
  matchOgRoute,
  readsEntityFor,
  resolveOg,
  rewriteHead,
} from './og'
import { preloadFiles, preloadTable, withPreloads } from './preload'
import { handleProxy, isProxyPath } from './proxy'
import { redirectFor } from './redirects'

export interface Env {
  ASSETS: Fetcher
  /** How long the HTML may wait for a tx or block page's first data (ms); tests on a slow machine raise it. */
  FIRST_DATA_BUDGET_MS?: string
  /** `off` for a fixture build (`review/serve.mjs`), which never uses first data. */
  FIRST_DATA?: string
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

async function preloaded(res: Response, request: Request, env: Env, url: URL): Promise<Response> {
  const table = await preloadTable(env.ASSETS, url.origin)
  if (!table) return res
  return withPreloads(res, preloadFiles(table, url, request.headers.get('accept-language')))
}

async function handle(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
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

  const redirect = redirectFor(url)
  if (redirect) {
    return new Response(null, {
      status: redirect.permanent ? 301 : 302,
      headers: {
        location: redirect.location,
        'cache-control': redirect.permanent ? 'public, max-age=300' : 'no-store',
      },
    })
  }

  const ua = request.headers.get('user-agent')
  const inlines =
    request.method === 'GET' &&
    env.FIRST_DATA !== 'off' &&
    !isLinkPreviewAgent(ua) &&
    !isCrawler(ua) &&
    !STATIC_FILE.test(url.pathname)
  // The page's first reads are looked up beside the shell's own fetch.
  const firstData = inlines
    ? fetchFirstData(url.origin, firstDataPlan(url), ctx, {
        budgetMs: Number(env.FIRST_DATA_BUDGET_MS) || undefined,
        warm: isNavigation(request),
      })
    : null

  const served = await serveAssets(request, env, url)
  if (url.pathname === SERVICE_WORKER_PATH && served.ok) return asServiceWorker(served)

  const isHtml = served.headers.get('content-type')?.startsWith('text/html') === true
  let res = isHtml && served.status === 200 ? await preloaded(served, request, env, url) : served
  // The shell waits for its first data at most FIRST_DATA_BUDGET_MS.
  if (firstData && isHtml && res.status === 200) res = withFirstData(res, await firstData)

  const og = matchOgRoute(url)
  if (og && res.ok && isHtml && request.method === 'GET') {
    const out = new Response(res.body, res)
    out.headers.append('vary', 'user-agent')
    const network = url.searchParams.get('network')
    const decentralized = url.searchParams.get('sources') === 'decentralized'
    const agent = request.headers.get('user-agent')
    const preview = isLinkPreviewAgent(agent) && !decentralized && readsEntityFor(og, agent)
    const meta = preview ? await resolveOg(og, network) : genericOg(og)
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
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return withSecurityHeaders(await handle(request, env, ctx))
  },
} satisfies ExportedHandler<Env>
