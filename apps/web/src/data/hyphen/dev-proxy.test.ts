import { describe, expect, it } from 'vitest'
import { HYPHEN_UPSTREAM, hyphenProxy, singleAllowOrigin } from './dev-proxy'

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
