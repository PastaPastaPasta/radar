import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { after, before, describe, it } from 'node:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { Miniflare } from 'miniflare'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const outdir = mkdtempSync(path.join(tmpdir(), 'radar-edge-'))

const wrangler = JSON.parse(
  readFileSync(path.join(root, 'wrangler.jsonc'), 'utf8').replace(/,(\s*[}\]])/g, '$1'),
)
const patterns = wrangler.assets.run_worker_first
const routerConfig = {
  has_user_worker: true,
  static_routing: {
    user_worker: patterns.filter((p) => !p.startsWith('!')),
    asset_worker: patterns.filter((p) => p.startsWith('!')).map((p) => p.slice(1)),
  },
}

let mf
let upstreamCalls = []
let upstream = () => new Response('not mocked', { status: 599 })

const origin = 'http://radar.localhost'
const get = (p, init) => mf.dispatchFetch(origin + p, { redirect: 'manual', ...init })

before(async () => {
  execFileSync(
    process.execPath,
    [
      path.join(root, 'node_modules/wrangler/bin/wrangler.js'),
      'deploy',
      '--dry-run',
      '--outdir',
      outdir,
    ],
    { cwd: root, stdio: 'pipe' },
  )
  mf = new Miniflare({
    modules: [
      {
        type: 'ESModule',
        path: 'index.js',
        contents: readFileSync(path.join(outdir, 'index.js'), 'utf8'),
      },
    ],
    compatibilityDate: '2026-08-01',
    bindings: { NATIVE_HOSTS: 'explorer.dashhq.org' },
    assets: {
      directory: path.join(root, 'test/dist'),
      binding: 'ASSETS',
      routerConfig,
    },
    outboundService: async (request) => {
      upstreamCalls.push(request)
      return upstream(request)
    },
  })
  await mf.ready
})

after(async () => {
  await mf?.dispose()
  rmSync(outdir, { recursive: true, force: true })
})

const reset = (fn) => {
  upstreamCalls = []
  upstream = fn ?? (() => new Response('not mocked', { status: 599 }))
}

describe('security headers', () => {
  it('sends a strict CSP and companions on documents', async () => {
    const res = await get('/')
    const csp = res.headers.get('content-security-policy')
    assert.match(csp, /default-src 'self'/)
    assert.match(csp, /script-src 'self' 'wasm-unsafe-eval'(;|$)/)
    assert.match(csp, /connect-src 'self' https:(;|$)/)
    assert.match(csp, /frame-ancestors 'none'/)
    assert.match(csp, /object-src 'none'/)
    assert.doesNotMatch(csp, /script-src[^;]*(https:|unsafe-inline|unsafe-eval(?!\b)|\*)/)
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff')
    assert.match(res.headers.get('strict-transport-security'), /max-age=\d+/)
    assert.equal(res.headers.get('x-frame-options'), 'DENY')
    assert.match(
      res.headers.get('content-security-policy-report-only'),
      /require-trusted-types-for 'script'/,
    )
    assert.match(res.headers.get('permissions-policy'), /camera=\(self\)/)
  })

  it('also sets them on assets and error responses', async () => {
    for (const p of ['/x/hy/mainnet/blocks', '/api/v1/summary', '/missing.png']) {
      reset(() => new Response('{}', { headers: { 'content-type': 'application/json' } }))
      const res = await get(p, p.startsWith('/x/') ? { method: 'POST' } : undefined)
      assert.ok(res.headers.get('content-security-policy'), p)
      assert.equal(res.headers.get('x-content-type-options'), 'nosniff', p)
    }
  })
})

describe('static assets and SPA fallback', () => {
  it('serves hashed assets without the Worker in front', async () => {
    const res = await get('/assets/app.js')
    assert.equal(res.status, 200)
    assert.match(await res.text(), /console\.log/)
  })

  it('falls back to index.html for app routes', async () => {
    for (const p of ['/masternodes', '/mn/abc', '/platform/block/12', '/some/deep/route?x=1']) {
      reset()
      const res = await get(p)
      assert.equal(res.status, 200, p)
      assert.match(await res.text(), /<div id="root">/, p)
    }
  })

  it('returns 404 for a missing file with an extension', async () => {
    const res = await get('/assets/missing.js')
    assert.equal(res.status, 404)
  })

  it('does not hand HTML to /api/v1 callers', async () => {
    const res = await get('/api/v1/mainnet/summary')
    assert.equal(res.status, 404)
    assert.match(res.headers.get('content-type'), /json/)
  })

  it('rejects writes to non-proxy paths', async () => {
    const res = await get('/masternodes', { method: 'POST' })
    assert.equal(res.status, 405)
  })
})

describe('hyphen pass-through', () => {
  it('maps mainnet and testnet to their upstreams, keeping path and query', async () => {
    reset(() => Response.json({ value: [] }))
    const a = await get('/x/hy/mainnet/blocks?limit=5')
    assert.equal(a.status, 200)
    assert.equal(upstreamCalls[0].url, 'https://hy.kw.vg/api/v1/blocks?limit=5')
    const b = await get('/x/hy/testnet/block/123')
    assert.equal(b.status, 200)
    assert.equal(upstreamCalls[1].url, 'https://ts.kw.vg/api/v1/block/123')
  })

  it('strips duplicate access-control headers and upstream noise', async () => {
    reset(() => {
      const h = new Headers({ 'content-type': 'application/json', etag: '"abc"' })
      h.append('access-control-allow-origin', 'https://hy.kw.vg')
      h.append('access-control-allow-origin', '*')
      h.set('set-cookie', 'a=b')
      h.set('nel', '{}')
      return new Response('{"ok":true}', { headers: h })
    })
    const res = await get('/x/hy/mainnet/blocks')
    assert.equal(res.headers.get('access-control-allow-origin'), null)
    assert.equal(res.headers.get('set-cookie'), null)
    assert.equal(res.headers.get('nel'), null)
    assert.equal(res.headers.get('etag'), '"abc"')
    assert.equal(res.headers.get('content-type'), 'application/json')
    assert.equal(res.headers.get('cache-control'), 'public, max-age=15')
    assert.deepEqual(await res.json(), { ok: true })
  })

  it('is GET and HEAD only', async () => {
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']) {
      reset()
      const res = await get('/x/hy/mainnet/blocks', { method })
      assert.equal(res.status, 405, method)
      assert.equal(res.headers.get('allow'), 'GET, HEAD')
      assert.equal(upstreamCalls.length, 0, method)
    }
  })

  it('does not forward cookies or authorization', async () => {
    reset(() => Response.json({}))
    await get('/x/hy/mainnet/blocks', {
      headers: { cookie: 'a=b', authorization: 'Bearer x', 'if-none-match': '"v1"' },
    })
    const sent = upstreamCalls[0].headers
    assert.equal(sent.get('cookie'), null)
    assert.equal(sent.get('authorization'), null)
    assert.equal(sent.get('if-none-match'), '"v1"')
  })

  it('rejects unknown networks and path escapes', async () => {
    reset()
    assert.equal((await get('/x/hy/devnet/blocks')).status, 404)
    assert.equal((await get('/x/hy/mainnet/..%2f..%2fsecret')).status, 400)
    assert.equal((await get('/x/hy/mainnet/a%5cb')).status, 400)
    assert.equal(upstreamCalls.length, 0)
  })

  it('does not cache upstream errors', async () => {
    reset(() => new Response('nope', { status: 500 }))
    const bad = await get('/x/hy/mainnet/blocks')
    assert.equal(bad.status, 500)
    assert.equal(bad.headers.get('cache-control'), 'no-store')
  })

  it('streams /stream through without caching', async () => {
    let controller
    let cancelled = false
    reset(
      () =>
        new Response(
          new ReadableStream({
            start(c) {
              controller = c
              c.enqueue(new TextEncoder().encode('{"event":"block"}\n'))
            },
            cancel() {
              cancelled = true
            },
          }),
          { headers: { 'content-type': 'application/x-ndjson', 'content-length': '999' } },
        ),
    )
    const res = await get('/x/hy/mainnet/stream')
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('cache-control'), 'no-store')
    assert.equal(res.headers.get('content-type'), 'application/x-ndjson')
    const reader = res.body.getReader()
    const first = await reader.read()
    assert.equal(new TextDecoder().decode(first.value), '{"event":"block"}\n')
    controller.enqueue(new TextEncoder().encode('{"event":"tx"}\n'))
    const second = await reader.read()
    assert.equal(new TextDecoder().decode(second.value), '{"event":"tx"}\n')
    await reader.cancel()
    void cancelled
  })
})

describe('redirects', () => {
  const check = async (host, p, expected) => {
    const res = await mf.dispatchFetch(`http://${host}${p}`, { redirect: 'manual' })
    if (expected === null) {
      assert.notEqual(res.status, 301, `${host}${p} should not redirect`)
    } else {
      assert.equal(res.status, 301, `${host}${p}`)
      assert.equal(res.headers.get('location'), expected, `${host}${p}`)
    }
  }

  it('maps the native explorer paths and defaults to testnet there', async () => {
    const h = 'explorer.dashhq.org'
    await check(h, '/identity/?id=ABC&tab=keys', '/identity/ABC?tab=keys&network=testnet')
    await check(h, '/identity/?id=ABC&network=mainnet', '/identity/ABC')
    await check(
      h,
      '/identity/lookup/?pkh=ff&network=testnet',
      '/identity/lookup?pkh=ff&network=testnet',
    )
    await check(h, '/contract/?id=C1', '/contract/C1?network=testnet')
    await check(
      h,
      '/contract/documents/?id=C1&type=note&limit=10',
      '/contract/C1/documents/note?limit=10&network=testnet',
    )
    await check(
      h,
      '/contract/document/?id=C1&type=note&docId=D1',
      '/document/C1/note/D1?network=testnet',
    )
    await check(h, '/token/?id=T1&network=mainnet', '/token/T1')
    await check(h, '/token/holders/?id=T1', '/token/T1/holders?network=testnet')
    await check(h, '/dpns/?name=alice.dash', '/name/alice.dash?network=testnet')
    await check(h, '/evonode/?proTxHash=ab12&network=mainnet', '/mn/ab12')
    await check(h, '/epoch/detail/?index=5', '/epoch/5?network=testnet')
    await check(h, '/network/status/?network=mainnet', '/status')
    await check(h, '/address/?addr=dash1x', '/platform-address/dash1x?network=testnet')
    await check(h, '/state-transition/?hash=AB', '/platform/tx/AB?network=testnet')
    await check(h, '/tools/?tool=state-transition', '/tools/state-transition?network=testnet')
    await check(h, '/governance/polls/?network=mainnet', '/polls')
    await check(h, '/search/?q=alice', '/search?q=alice&network=testnet')
  })

  it('sends write paths to the entity page and drops signing parameters', async () => {
    const h = 'explorer.dashhq.org'
    await check(h, '/broadcast/?op=transfer&identity=ID1&network=mainnet', '/identity/ID1')
    await check(h, '/broadcast/?op=mint&token=T9', '/token/T9?network=testnet')
    await check(h, '/wallet/', '/about?network=testnet')
  })

  it('does not apply the testnet default off the native host', async () => {
    await check('radar.localhost', '/identity/?id=ABC', '/identity/ABC')
  })

  it('maps Insight-style and Radar legacy paths on any host', async () => {
    await check('radar.localhost', '/block-index/2569999', '/block/2569999')
    await check('radar.localhost', '/insight/block/' + 'a'.repeat(64), '/block/' + 'a'.repeat(64))
    await check(
      'radar.localhost',
      '/insight/tx/' + 'b'.repeat(64) + '?network=testnet',
      '/tx/' + 'b'.repeat(64) + '?network=testnet',
    )
    await check('radar.localhost', '/insight/address/XabcDEF', '/address/XabcDEF')
    await check(
      'radar.localhost',
      '/insight/blocks?blockDate=2026-10-01',
      '/blocks?date=2026-10-01',
    )
    await check('radar.localhost', '/masternodes.html?net=testnet', '/masternodes?network=testnet')
    await check(
      'radar.localhost',
      '/mn/' + 'c'.repeat(64) + '?net=testnet',
      '/mn/' + 'c'.repeat(64) + '?network=testnet',
    )
    await check('radar.localhost', '/map?net=testnet&q=x', '/map?q=x&network=testnet')
  })

  it('never redirects to another origin', async () => {
    for (const p of [
      '//evil.example/x?net=testnet',
      '///evil.example?network=mainnet',
      '/\\evil.example?net=testnet',
    ]) {
      const res = await mf.dispatchFetch(`http://radar.localhost${p}`, { redirect: 'manual' })
      const loc = res.headers.get('location')
      if (loc) assert.match(loc, /^\/(?![/\\])/, p)
    }
  })

  it('leaves canonical URLs alone', async () => {
    await check('radar.localhost', '/masternodes?network=testnet&sort=-balance', null)
    await check('radar.localhost', '/search?network=testnet&q=x', null)
    await check('radar.localhost', '/platform', null)
    await check('explorer.dashhq.org', '/', null)
    await check('explorer.dashhq.org', '/mn/' + 'd'.repeat(64), null)
    await check('radar.localhost', '/identity/lookup?pkh=ab', null)
  })
})

describe('per-entity title and OG', () => {
  const protx = 'e'.repeat(64)
  const identity = 'BjixEUbqeUZK7BRdqtLgjzwFBovx4BRwS2iwhMriiYqp'

  it('fills title and OG tags from one backend read', async () => {
    reset(() => Response.json({ type: 'Evo', status: 'enabled', version: '24.0.0', country: 'DE' }))
    const res = await get(`/mn/${protx}`)
    const html = await res.text()
    assert.equal(upstreamCalls.length, 1)
    assert.equal(
      upstreamCalls[0].url,
      `https://radar.dashhq.org/api/v1/mainnet/masternodes/${protx}`,
    )
    assert.match(html, /<title>Evonode eeeeeeee…eeeeee · Radar<\/title>/)
    assert.match(html, /property="og:title" content="Evonode eeeeeeee…eeeeee · Radar"/)
    assert.match(html, /property="og:description" content="enabled · 24\.0\.0 · DE"/)
    assert.match(html, /<div id="root">/)
  })

  it('uses the testnet backends for ?network=testnet', async () => {
    reset(() =>
      Response.json({ blockHeight: 1234567, txCount: 3, blockTime: '2026-11-10T00:00:00Z' }),
    )
    const res = await get('/block/1234567?network=testnet')
    const html = await res.text()
    assert.equal(upstreamCalls[0].url, 'https://ts.kw.vg/api/v1/block/1234567')
    assert.match(html, /<title>Block 1,234,567 · Radar<\/title>/)
    assert.match(
      html,
      /og:url" content="http:\/\/radar\.localhost\/block\/1234567\?network=testnet"/,
    )
  })

  it('names an identity by its first DPNS alias', async () => {
    reset(() => Response.json({ aliases: [{ alias: 'pshenmic.dash' }] }))
    const html = await (await get(`/identity/${identity}`)).text()
    assert.equal(upstreamCalls[0].url, `https://api.pe.dashhq.org/identity/${identity}`)
    assert.match(html, /<title>Identity pshenmic\.dash · Radar<\/title>/)
  })

  it('escapes backend text', async () => {
    reset(() =>
      Response.json({ name: '"><script>alert(1)</script>', description: '<img src=x onerror=1>' }),
    )
    const html = await (await get(`/contract/${identity}`)).text()
    assert.doesNotMatch(html, /<script>alert/)
    assert.doesNotMatch(html, /<img src=x/)
    assert.match(html, /&lt;script&gt;/)
  })

  it('falls back to a generic title when the backend fails or the id is malformed', async () => {
    reset(() => new Response('boom', { status: 500 }))
    let html = await (await get(`/token/${identity}`)).text()
    assert.match(html, /<title>Token · Radar<\/title>/)
    reset()
    html = await (await get('/tx/not-a-txid')).text()
    assert.match(html, /<title>Transaction · Radar<\/title>/)
    assert.equal(upstreamCalls.length, 0)
    reset(() => {
      throw new Error('timeout')
    })
    html = await (await get(`/mn/${protx}`)).text()
    assert.match(html, /<title>Masternode · Radar<\/title>/)
  })

  it('makes no backend call for devnets or other routes', async () => {
    reset()
    await get(`/mn/${protx}?network=devnet-x`)
    await get('/masternodes')
    await get('/')
    assert.equal(upstreamCalls.length, 0)
  })
})
