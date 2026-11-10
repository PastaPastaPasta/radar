import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ProxyOptions } from 'vite'
import { HYPHEN_API_BASE, resolveHyphenRequest } from '../../../../../workers/edge/src/hyphen-path'

export const HYPHEN_UPSTREAM = {
  mainnet: new URL(HYPHEN_API_BASE.mainnet).origin,
  testnet: new URL(HYPHEN_API_BASE.testnet).origin,
}

function resolve(url: string) {
  const at = url.indexOf('?')
  return resolveHyphenRequest(at < 0 ? url : url.slice(0, at), at < 0 ? '' : url.slice(at))
}

type Headers = Record<string, string | string[] | number | undefined>

/**
 * Hyphen sends `Access-Control-Allow-Origin` twice (`*` and its own origin), which browsers reject.
 * The proxy answers same-origin, so one permissive value is all the page needs.
 */
export function singleAllowOrigin(headers: Headers): void {
  if (headers['access-control-allow-origin'] !== undefined) {
    headers['access-control-allow-origin'] = '*'
  }
}

function refuse(res: ServerResponse, status: number, error: string, allow?: string): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.setHeader('cache-control', 'no-store')
  if (allow) res.setHeader('allow', allow)
  res.end(JSON.stringify({ error }))
}

/**
 * Applies the Worker's rules (methods, known networks and paths, parameter allowlist). A refusal is
 * answered here and the request is handed back unchanged so the proxy leaves the ended response alone.
 */
export function checkHyphenRequest(req: IncomingMessage, res: ServerResponse | undefined): void {
  if (!res) return
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    refuse(res, 405, 'method_not_allowed', 'GET, HEAD')
    return
  }
  const resolved = resolve(req.url ?? '')
  if (!resolved.ok) refuse(res, resolved.status, resolved.error)
}

/** Dev-server and preview proxy for `/x/hy/{net}`, standing in for the edge Worker's pass-through. */
export function hyphenProxy(): Record<string, ProxyOptions> {
  const entries = Object.entries(HYPHEN_UPSTREAM).map(([net, target]): [string, ProxyOptions] => [
    `/x/hy/${net}`,
    {
      target,
      changeOrigin: true,
      secure: true,
      bypass: (req, res) => {
        checkHyphenRequest(req, res)
        return res?.writableEnded ? (req.url ?? '') : undefined
      },
      rewrite: (path) => {
        const resolved = resolve(path)
        return resolved.ok ? `${resolved.url.pathname}${resolved.url.search}` : path
      },
      configure: (proxy) => {
        proxy.on('proxyRes', (proxyRes) => singleAllowOrigin(proxyRes.headers))
      },
    },
  ])
  return Object.fromEntries(entries)
}
