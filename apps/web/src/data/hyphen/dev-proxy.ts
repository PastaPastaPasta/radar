import type { ProxyOptions } from 'vite'

export const HYPHEN_UPSTREAM = {
  mainnet: 'https://hy.kw.vg',
  testnet: 'https://ts.kw.vg',
} as const

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

/** Dev-server and preview proxy for `/x/hy/{net}`, standing in for the edge Worker's pass-through. */
export function hyphenProxy(): Record<string, ProxyOptions> {
  const entries = Object.entries(HYPHEN_UPSTREAM).map(([net, target]): [string, ProxyOptions] => [
    `/x/hy/${net}`,
    {
      target,
      changeOrigin: true,
      secure: true,
      rewrite: (path) => path.replace(`/x/hy/${net}`, '/api/v1'),
      configure: (proxy) => {
        proxy.on('proxyRes', (proxyRes) => singleAllowOrigin(proxyRes.headers))
      },
    },
  ])
  return Object.fromEntries(entries)
}
