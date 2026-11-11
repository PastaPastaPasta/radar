import { describe, expect, it } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { HYPHEN_UPSTREAM, checkHyphenRequest, hyphenProxy, singleAllowOrigin } from './dev-proxy'

describe('singleAllowOrigin', () => {
  it('collapses a duplicated header to one permissive value', () => {
    const headers = { 'access-control-allow-origin': ['*', 'https://hy.kw.vg'] }
    singleAllowOrigin(headers)
    expect(headers['access-control-allow-origin']).toBe('*')
  })

  it('leaves responses without the header alone', () => {
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    singleAllowOrigin(headers)
    expect(headers).toEqual({ 'content-type': 'application/json' })
  })
})

describe('hyphenProxy', () => {
  const proxy = hyphenProxy()

  it('has one entry per network, pointed at its Hyphen host', () => {
    expect(Object.keys(proxy).sort()).toEqual(['/x/hy/mainnet', '/x/hy/testnet'])
    expect(proxy['/x/hy/mainnet']?.target).toBe(HYPHEN_UPSTREAM.mainnet)
    expect(proxy['/x/hy/testnet']?.target).toBe(HYPHEN_UPSTREAM.testnet)
  })

  it('rewrites the public prefix onto the upstream API root', () => {
    const rewrite = proxy['/x/hy/mainnet']?.rewrite
    expect(rewrite?.('/x/hy/mainnet/blocks?limit=20')).toBe('/api/v1/blocks?limit=20')
    expect(proxy['/x/hy/testnet']?.rewrite?.('/x/hy/testnet/stream')).toBe('/api/v1/stream')
  })

  it('fixes the header on every proxied response', () => {
    const handlers: Record<string, (res: { headers: Record<string, unknown> }) => void> = {}
    const fake = {
      on: (event: string, fn: (res: { headers: Record<string, unknown> }) => void) =>
        void (handlers[event] = fn),
    }
    proxy['/x/hy/mainnet']?.configure?.(fake as never, {})
    const res = { headers: { 'access-control-allow-origin': ['*', 'http://localhost'] } }
    handlers.proxyRes?.(res)
    expect(res.headers['access-control-allow-origin']).toBe('*')
  })
})

describe('hyphenProxy request rules', () => {
  const proxy = hyphenProxy()
  const rewrite = proxy['/x/hy/mainnet']!.rewrite!
  const bypass = proxy['/x/hy/mainnet']!.bypass!

  function run(url: string, method = 'GET') {
    const res = {
      statusCode: 200,
      writableEnded: false,
      headers: {} as Record<string, string>,
      body: '',
      setHeader(name: string, value: string) {
        this.headers[name] = value
      },
      end(body: string) {
        this.body = body
        this.writableEnded = true
      },
    }
    const req = { url, method } as IncomingMessage
    const result = bypass(req, res as unknown as ServerResponse, {})
    return { res, result }
  }

  it('lets the paths and parameters the app uses through', () => {
    const { res, result } = run('/x/hy/mainnet/address/Xabc/txs?limit=10&cursor=ff')
    expect(res.writableEnded).toBe(false)
    expect(result).toBeUndefined()
  })

  it('answers like the Worker for unsafe, unknown and look-alike paths', () => {
    const cases: [string, number, string][] = [
      ['/x/hy/mainnet/..%2fstatus', 400, 'bad_path'],
      ['/x/hy/mainnet/a%5cb', 400, 'bad_path'],
      ['/x/hy/mainnet/block%2f1', 400, 'bad_path'],
      ['/x/hy/mainnetX/blocks', 404, 'unknown_network'],
      ['/x/hy/mainnet', 404, 'unknown_network'],
      ['/x/hy/mainnet/admin', 404, 'unknown_path'],
      ['/x/hy/mainnet/search?q=' + 'a'.repeat(600), 400, 'bad_query'],
    ]
    for (const [url, status, error] of cases) {
      const { res, result } = run(url)
      expect(res.statusCode, url).toBe(status)
      expect(JSON.parse(res.body), url).toEqual({ error })
      expect(result, url).toBe(url)
    }
  })

  it('accepts GET and HEAD only', () => {
    for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS']) {
      const { res } = run('/x/hy/mainnet/blocks', method)
      expect(res.statusCode, method).toBe(405)
      expect(res.headers.allow).toBe('GET, HEAD')
    }
    expect(run('/x/hy/mainnet/blocks', 'HEAD').res.writableEnded).toBe(false)
  })

  it("forwards only the known parameters, in the Worker's order", () => {
    expect(rewrite('/x/hy/mainnet/blocks?utm=1&limit=5&cursor=ff')).toBe(
      '/api/v1/blocks?cursor=ff&limit=5',
    )
  })

  it('does nothing without a response to write to', () => {
    expect(() =>
      checkHyphenRequest({ url: '/x/hy/mainnet/x', method: 'GET' } as IncomingMessage, undefined),
    ).not.toThrow()
  })
})
