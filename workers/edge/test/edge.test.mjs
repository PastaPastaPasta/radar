import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { after, before, describe, it } from 'node:test'
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { createRequire } from 'node:module'
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

const BUDGET_MS = 8000
let mf
let upstreamCalls = []
let upstream = () => new Response('not mocked', { status: 599 })
// The price every page inlines is answered apart, so the other tests count only their own upstream reads.
const RATE_URL = 'https://api.pe.dashhq.org/rate'
let rateCalls = []
let rateAnswer = () => Response.json({ usd: 30, source: 'test' })

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
      '--assets',
      path.join(root, 'test/site'),
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
    // The production budget (300 ms) is shorter than one Miniflare round trip on a loaded machine.
    bindings: { FIRST_DATA_BUDGET_MS: String(BUDGET_MS) },
    assets: {
      directory: path.join(root, 'test/site'),
      binding: 'ASSETS',
      routerConfig,
    },
    outboundService: async (request) => {
      if (request.url === RATE_URL) {
        rateCalls.push(request)
        return rateAnswer(request)
      }
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
    assert.match(csp, /worker-src 'self'(;|$)/)
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

  it('marks documents no-transform so the edge injects no analytics beacon the CSP would refuse', async () => {
    for (const p of ['/', '/settings', '/identity/ABC']) {
      const res = await get(p)
      assert.match(res.headers.get('content-type'), /^text\/html/, p)
      assert.match(res.headers.get('cache-control') ?? '', /(^|, )no-transform$/, p)
    }
    const sw = await get('/sw.js')
    assert.doesNotMatch(sw.headers.get('cache-control'), /no-transform/)
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

  it('serves the service worker as JavaScript that is always rechecked', async () => {
    for (const method of ['GET', 'HEAD']) {
      const res = await get('/sw.js', { method })
      assert.equal(res.status, 200, method)
      assert.match(res.headers.get('content-type'), /^text\/javascript/, method)
      assert.equal(res.headers.get('cache-control'), 'no-cache', method)
      assert.ok(res.headers.get('content-security-policy'), method)
    }
    assert.match(await (await get('/sw.js')).text(), /skipWaiting/)
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

describe('route preloads', () => {
  const preloads = async (p, headers) => {
    const html = await (await get(p, headers ? { headers } : undefined)).text()
    return [...html.matchAll(/<link rel="(modulepreload|preload)"[^>]*href="([^"]+)"/g)].map(
      (m) => m[2],
    )
  }

  it("preloads the route's chunks and the catalog, and leaves the DAPI pool to load after first paint", async () => {
    assert.deepEqual(await preloads('/tx/abc'), [
      '/assets/en.js',
      '/assets/tx.js',
      '/assets/queries.js',
    ])
  })

  it('picks the literal route over a parameter, and preloads its stylesheet as a style', async () => {
    const html = await (await get('/identity/lookup')).text()
    assert.match(
      html,
      /<link rel="modulepreload" crossorigin data-route href="\/assets\/lookup.js">/,
    )
    assert.match(
      html,
      /<link rel="preload" as="style" crossorigin data-route href="\/assets\/changes.css">/,
    )
    assert.doesNotMatch(html, /identity\.js/)
  })

  it("follows the visitor's language, marks the catalog apart from the route's chunks, and varies by language", async () => {
    const files = await preloads('/?network=testnet', { 'accept-language': 'de-AT,de;q=0.9' })
    assert.deepEqual(files, ['/assets/de.js', '/assets/home.js'])
    const res = await get('/', { headers: { 'accept-language': 'de' } })
    assert.match(res.headers.get('vary') ?? '', /accept-language/i)
    const html = await res.text()
    assert.match(html, /<link rel="modulepreload" crossorigin data-locale href="\/assets\/de.js">/)
    assert.match(html, /<link rel="modulepreload" crossorigin data-route href="\/assets\/home.js">/)
  })

  it('still preloads the catalog on a path no route claims', async () => {
    assert.deepEqual(await preloads('/no/such/page'), ['/assets/en.js'])
  })
})

describe('first data for immutable pages', () => {
  // The edge cache outlives a test, so every test names its own tx and block.
  let n = 0
  const ids = () => {
    n += 1
    return { txid: n.toString(16).padStart(64, 'a'), hash: n.toString(16).padStart(64, 'c') }
  }
  const TIP = 2_000_000
  const status = { syncStatus: 'synced', blockHeight: TIP, indices: {} }
  // A slow answer is held until the next test starts, so it never holds up that test's reads.
  let release = () => {}
  const hyphen = (routes, { delayMs = {} } = {}) => {
    release()
    const held = new Promise((r) => (release = r))
    reset(async (req) => {
      const path = new URL(req.url).pathname.replace(/^\/api\/v1\//, '')
      const wait = delayMs[path.split('/')[0]] ?? delayMs['*'] ?? 0
      if (wait) await Promise.race([held, new Promise((r) => setTimeout(r, wait).unref())])
      const body = routes[path]
      return body === undefined
        ? Response.json({ error: 'nf' }, { status: 404 })
        : Response.json(body)
    })
  }
  after(() => release())
  const NAVIGATE = { 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' }
  /** The page's inlined Hyphen reads; the price every page carries has its own tests. */
  const payload = async (p, headers = NAVIGATE) => {
    const html = await (await get(p, { headers })).text()
    const m = /<script type="application\/json" id="radar-first-data">([^<]*)<\/script>/.exec(html)
    if (!m) return null
    const data = JSON.parse(m[1])
    delete data.reads[RATE_URL]
    return Object.keys(data.reads).length > 0 ? data : null
  }
  /** The inlined bodies by path, after checking each says when the edge read it. */
  const inlined = async (p, init) => {
    const data = await payload(p, { ...NAVIGATE, ...init?.headers })
    if (!data) return null
    assert.ok(Math.abs(Date.now() - data.at) < 60_000)
    for (const read of Object.values(data.reads)) assert.ok(read.fetchedAt <= data.at)
    return Object.fromEntries(Object.entries(data.reads).map(([k, v]) => [k, v.body]))
  }
  const settle = () => new Promise((r) => setTimeout(r, 300))
  /** The first visit only warms the edge cache; a later one gets the answers. */
  const warmed = async (p) => {
    for (let i = 0; i < 20; i++) {
      const reads = await inlined(p)
      if (reads) return reads
      await new Promise((r) => setTimeout(r, 100))
    }
    return null
  }
  const minedTx = (txid, height, asOf = TIP) => ({
    status,
    [`rawtx/${txid}`]: { rawtx: '00' },
    [`tx/${txid}`]: { txHash: txid, blockHeight: height, asOfHeight: asOf },
    [`block/${height}`]: { blockHeight: height, blockTime: '2026-11-18T16:55:45Z' },
  })
  const block = (hash, height, extra = {}) => ({
    blockHeight: height,
    blockHash: hash,
    asOfHeight: TIP,
    orphanedAt: null,
    ...extra,
  })

  it('sends the shell at once on a first visit and inlines the reads on the next, keyed by their pass-through paths', async () => {
    const { txid } = ids()
    const height = TIP - 100 - n
    hyphen(minedTx(txid, height))
    assert.equal(await inlined(`/tx/${txid}`), null)
    assert.ok(upstreamCalls.every((r) => r.url.startsWith('https://hy.kw.vg/api/v1/')))
    // The block's time is a read that needs the tx, so it is warmed by the visit that first finds the tx.
    await warmed(`/tx/${txid.toUpperCase()}`)
    const reads = await warmed(`/tx/${txid}`).then(async (r) =>
      r?.[`/x/hy/mainnet/block/${height}`] ? r : warmed(`/tx/${txid}`),
    )
    assert.deepEqual(Object.keys(reads).sort(), [
      `/x/hy/mainnet/block/${height}`,
      `/x/hy/mainnet/rawtx/${txid}`,
      '/x/hy/mainnet/status',
      `/x/hy/mainnet/tx/${txid}`,
    ])
    assert.equal(reads[`/x/hy/mainnet/tx/${txid}`].blockHeight, height)
  })

  it('answers from the edge cache without asking Hyphen again', async () => {
    const { txid } = ids()
    hyphen(minedTx(txid, TIP - 100))
    assert.ok(await warmed(`/tx/${txid}`))
    reset()
    assert.ok((await inlined(`/tx/${txid}`))?.[`/x/hy/mainnet/rawtx/${txid}`])
    assert.deepEqual(
      upstreamCalls.filter((r) => /\/(rawtx|tx)\//.test(r.url)),
      [],
    )
  })

  it('inlines a block by height or by hash, on the network the link names', async () => {
    const { hash } = ids()
    const h = TIP - 6 - n
    hyphen({ status, [`rawblock/${h}`]: { rawblock: '00' }, [`block/${h}`]: block(hash, h) })
    const byHeight = await warmed(`/block/${h}?network=testnet`)
    assert.ok(byHeight[`/x/hy/testnet/rawblock/${h}`])
    assert.ok(byHeight[`/x/hy/testnet/block/${h}`])
    assert.ok(upstreamCalls.every((r) => r.url.startsWith('https://ts.kw.vg/api/v1/')))
    hyphen({
      status,
      [`rawblock/${hash}`]: { rawblock: '00' },
      [`block/${hash}`]: block(hash, TIP - 50),
    })
    assert.ok((await warmed(`/block/${hash}`))[`/x/hy/mainnet/rawblock/${hash}`])
  })

  it('never inlines when a read misses', async () => {
    const { txid } = ids()
    const routes = minedTx(txid, TIP - 100)
    delete routes[`rawtx/${txid}`]
    hyphen(routes)
    assert.equal(await warmed(`/tx/${txid}`), null)
  })

  it('reads Hyphen ahead only for a navigation, and keeps its "not found" for a while', async () => {
    const { txid } = ids()
    const routes = minedTx(txid, TIP - 100)
    delete routes[`rawtx/${txid}`]
    hyphen(routes)
    await get(`/tx/${txid}`)
    await get(`/tx/${txid}`, { headers: { 'sec-fetch-mode': 'cors' } })
    await settle()
    assert.equal(upstreamCalls.length, 0)
    const rawReads = () => upstreamCalls.filter((r) => r.url.includes(`/rawtx/${txid}`)).length
    await payload(`/tx/${txid}`)
    for (let i = 0; i < 50 && rawReads() === 0; i++) await settle()
    await new Promise((r) => setTimeout(r, 2000))
    const before = rawReads()
    for (let i = 0; i < 3; i++) assert.equal(await inlined(`/tx/${txid}`), null)
    await settle()
    assert.equal(rawReads(), before)
  })

  it('reads no first data for search crawlers', async () => {
    const { txid } = ids()
    hyphen(minedTx(txid, TIP - 100))
    for (const ua of [
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
      'Mozilla/5.0 (compatible; Yahoo! Slurp; http://help.yahoo.com/help/us/ysearch/slurp)',
    ])
      assert.equal(await payload(`/tx/${txid}`, { ...NAVIGATE, 'user-agent': ua }), null, ua)
    await settle()
    // Googlebot and bingbot are link-preview agents, so each gets the one title read (`tx/{id}`) a preview gets;
    // none of the page's first data (raw bytes, status, block) is read for any of them.
    const reads = upstreamCalls.map((r) => new URL(r.url).pathname)
    assert.deepEqual(reads, [`/api/v1/tx/${txid}`, `/api/v1/tx/${txid}`])
  })

  it("drops the shell's validators from a page it added data to", async () => {
    const { txid } = ids()
    hyphen(minedTx(txid, TIP - 100))
    assert.ok(await warmed(`/tx/${txid}`))
    const res = await get(`/tx/${txid}`, { headers: NAVIGATE })
    assert.match(await res.text(), /radar-first-data/)
    assert.equal(res.headers.get('etag'), null)
    assert.equal(res.headers.get('last-modified'), null)
  })

  it('never inlines an unconfirmed tx', async () => {
    const { txid } = ids()
    hyphen({
      status,
      [`rawtx/${txid}`]: { rawtx: '00' },
      [`tx/${txid}`]: { txHash: txid, blockHeight: null, asOfHeight: TIP },
    })
    assert.equal(await warmed(`/tx/${txid}`), null)
  })

  it('never inlines a block, or a tx in a block, within six blocks of the tip', async () => {
    const a = ids()
    hyphen(minedTx(a.txid, TIP - 5))
    assert.equal(await warmed(`/tx/${a.txid}`), null)
    hyphen({
      status,
      [`rawblock/${a.hash}`]: { rawblock: '00' },
      [`block/${a.hash}`]: block(a.hash, TIP - 5),
    })
    assert.equal(await warmed(`/block/${a.hash}`), null)
    const b = ids()
    hyphen({
      status,
      [`rawblock/${b.hash}`]: { rawblock: '00' },
      [`block/${b.hash}`]: block(b.hash, TIP - 100, { orphanedAt: '2026-11-18T00:00:00Z' }),
    })
    assert.equal(await warmed(`/block/${b.hash}`), null)
  })

  it('reads nothing for a bad id, a devnet, a Decentralized only link or a link preview', async () => {
    const { txid } = ids()
    hyphen(minedTx(txid, TIP - 100))
    for (const p of [
      '/tx/abc',
      `/tx/${txid}x`,
      '/tx/123',
      '/block/-1',
      '/block/1234567890',
      `/tx/${txid}?network=devnet-x`,
      `/tx/${txid}?network=constructor`,
      `/tx/${txid}?sources=decentralized`,
    ])
      assert.equal(await inlined(p), null, p)
    await new Promise((r) => setTimeout(r, 200))
    assert.equal(upstreamCalls.length, 0)
    // A preview reads its own one backend answer for the title, never the page's first data.
    const preview = await inlined(`/tx/${txid}`, {
      headers: { 'user-agent': 'Slackbot-LinkExpanding 1.0' },
    })
    assert.equal(preview, null)
    assert.ok(upstreamCalls.length <= 1)
  })

  it('cannot close its own script element', async () => {
    const { txid } = ids()
    const routes = minedTx(txid, TIP - 100)
    routes[`tx/${txid}`] = { ...routes[`tx/${txid}`], note: '</script><script>x()' }
    hyphen(routes)
    assert.ok(await warmed(`/tx/${txid}`))
    const html = await (await get(`/tx/${txid}`)).text()
    assert.doesNotMatch(html, /<\/script><script>x\(\)/)
    const m = /id="radar-first-data">([^<]*)<\/script>/.exec(html)
    assert.equal(
      JSON.parse(m[1]).reads[`/x/hy/mainnet/tx/${txid}`].body.note,
      '</script><script>x()',
    )
  })
})

describe('the price on every page', () => {
  const NAVIGATE = { 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' }
  const firstData = async (p, headers = NAVIGATE) => {
    const html = await (await get(p, { headers })).text()
    const m = /<script type="application\/json" id="radar-first-data">([^<]*)<\/script>/.exec(html)
    return m ? JSON.parse(m[1]) : null
  }
  const settle = () => new Promise((r) => setTimeout(r, 300))

  it('is read upstream by a navigation that finds none, then inlined on any page with when the edge read it', async () => {
    let data = null
    for (let i = 0; i < 20 && !data?.reads?.[RATE_URL]; i++) {
      data = await firstData('/blocks')
      if (!data?.reads?.[RATE_URL]) await settle()
    }
    assert.ok(data?.reads?.[RATE_URL], 'inlined after the warm-up')
    assert.equal(typeof data.reads[RATE_URL].body.usd, 'number')
    assert.ok(data.reads[RATE_URL].fetchedAt <= data.at)
    const calls = rateCalls.length
    assert.ok(calls >= 1)
    const other = await firstData('/nodes')
    assert.ok(other?.reads?.[RATE_URL])
    assert.equal(rateCalls.length, calls, 'answered from the edge cache')
    assert.equal(rateCalls[0].headers.get('user-agent')?.startsWith('Radar/'), true)
  })

  it('sends a page that carries it whole, so a copy the browser kept with its etag never freezes it out', async () => {
    for (let i = 0; i < 20 && !(await firstData('/nodes'))?.reads?.[RATE_URL]; i++) await settle()
    const res = await get('/nodes', { headers: { ...NAVIGATE, 'if-none-match': '"anything"' } })
    assert.equal(res.status, 200)
    assert.match(await res.text(), /radar-first-data/)
  })

  it('leaves it out of a Decentralized only link, which reads no hosted source', async () => {
    assert.equal(await firstData('/nodes?sources=decentralized'), null)
  })

  it('inlines nothing for a crawler or a link preview, and never into a static file', async () => {
    assert.equal(
      await firstData('/blocks', {
        'user-agent': 'Googlebot/2.1 (+http://www.google.com/bot.html) crawler',
      }),
      null,
    )
    const js = await get('/assets/app.js')
    assert.doesNotMatch(await js.text(), /radar-first-data/)
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

  it('passes an address-history cursor, which is far longer than a block cursor @IN-06', async () => {
    reset(() => Response.json({ value: [] }))
    const cursor = '7b'.repeat(179)
    const res = await get(`/x/hy/mainnet/address/Xaddr/txs?limit=25&cursor=${cursor}`)
    assert.equal(res.status, 200)
    assert.equal(
      upstreamCalls[0].url,
      `https://hy.kw.vg/api/v1/address/Xaddr/txs?cursor=${cursor}&limit=25`,
    )
    assert.equal((await get(`/x/hy/mainnet/blocks?cursor=${'7b'.repeat(257)}`)).status, 400)
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

  it('lets browsers and the edge keep raw bytes named by their hash, and nothing else', async () => {
    const hash = 'ab'.repeat(32)
    for (const [p, cache] of [
      [`/x/hy/mainnet/rawtx/${hash}`, 'public, max-age=86400, immutable'],
      [`/x/hy/mainnet/rawblock/${hash}`, 'public, max-age=86400, immutable'],
      [`/x/hy/mainnet/tx/${hash}`, 'public, max-age=15'],
      ['/x/hy/mainnet/rawblock/2574433', 'public, max-age=15'],
    ]) {
      reset(() => Response.json({}))
      const res = await get(p)
      assert.equal(res.headers.get('cache-control'), cache, p)
    }
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

  it("sends its own user agent upstream, never the browser's", async () => {
    reset(() => Response.json({}))
    await get('/x/hy/mainnet/blocks', { headers: { 'user-agent': 'Mozilla/5.0 (private)' } })
    assert.match(upstreamCalls[0].headers.get('user-agent') ?? '', /^Radar\//)
  })

  it('rejects unknown networks and path escapes', async () => {
    reset()
    assert.equal((await get('/x/hy/devnet/blocks')).status, 404)
    assert.equal((await get('/x/hy/mainnet/..%2f..%2fsecret')).status, 400)
    assert.equal((await get('/x/hy/mainnet/a%5cb')).status, 400)
    assert.equal(upstreamCalls.length, 0)
  })

  it('relays only JSON, and NDJSON on the stream', async () => {
    const types = [
      'text/html',
      'text/javascript',
      'application/javascript',
      'application/x-ndjson',
      '',
    ]
    for (const type of types) {
      reset(() => new Response('alert(1)', { headers: type ? { 'content-type': type } : {} }))
      const res = await get('/x/hy/mainnet/blocks')
      assert.equal(res.status, 502, type)
      assert.deepEqual(await res.json(), { error: 'bad_upstream_type' }, type)
      assert.equal(res.headers.get('cache-control'), 'no-store')
    }
    reset(() => new Response('{}', { headers: { 'content-type': 'text/event-stream' } }))
    assert.equal((await get('/x/hy/mainnet/stream')).status, 502)
    for (const type of [
      'application/json; charset=utf-8',
      'APPLICATION/JSON',
      'application/problem+json',
    ]) {
      reset(() => new Response('{"a":1}', { headers: { 'content-type': type } }))
      const res = await get('/x/hy/mainnet/blocks')
      assert.equal(res.status, 200, type)
      assert.equal(res.headers.get('content-type'), type.split(';')[0].toLowerCase())
      assert.deepEqual(await res.json(), { a: 1 })
    }
  })

  it('keeps an error status but not an HTML or empty error body', async () => {
    reset(
      () =>
        new Response('<h1>nope</h1>', { status: 404, headers: { 'content-type': 'text/html' } }),
    )
    let res = await get('/x/hy/mainnet/block/1')
    assert.equal(res.status, 404)
    assert.deepEqual(await res.json(), { error: 'upstream_error' })
    reset(() => new Response(null, { status: 404 }))
    res = await get('/x/hy/mainnet/block/1')
    assert.equal(res.status, 404)
    assert.match(res.headers.get('content-type'), /json/)
    reset(() => new Response(null, { status: 304, headers: { etag: '"v1"' } }))
    res = await get('/x/hy/mainnet/blocks', { headers: { 'if-none-match': '"v1"' } })
    assert.equal(res.status, 304)
    assert.equal(res.headers.get('etag'), '"v1"')
  })

  it('locks proxy responses down so they can never run or render as the app', async () => {
    reset(() => Response.json({}))
    const responses = [
      await get('/x/hy/mainnet/blocks'),
      await get('/x/hy/mainnet/blocks', { method: 'POST' }),
      await get('/x/hy/mainnet/nope'),
      await get('/x/hy/devnet/blocks'),
    ]
    for (const res of responses) {
      assert.equal(res.headers.get('content-security-policy'), "default-src 'none'; sandbox")
      assert.equal(res.headers.get('cross-origin-resource-policy'), 'same-origin')
      assert.equal(res.headers.get('x-content-type-options'), 'nosniff')
    }
    const page = await get('/')
    assert.match(page.headers.get('content-security-policy'), /default-src 'self'/)
  })

  it('refuses paths the app does not use', async () => {
    reset(() => Response.json({}))
    for (const p of [
      'admin',
      'blocks/',
      'blocks/extra',
      'block',
      'block/1/txs/2',
      'block/1/utxos',
      'address/x/votes',
      'metrics',
      'mainnetX/blocks',
    ]) {
      const res = await get(`/x/hy/mainnet/${p}`)
      assert.equal(res.status, 404, p)
      assert.deepEqual(await res.json(), { error: 'unknown_path' }, p)
    }
    assert.equal((await get('/x/hy/mainnetX/blocks')).status, 404)
    assert.equal((await get('/x/hy/mainnet')).status, 404)
    assert.equal(upstreamCalls.length, 0)
    for (const p of [
      'blocks',
      'balances',
      'status',
      'network',
      'mempool',
      'mempool/txs',
      'metrics/latest',
      'metrics/chart',
      'proposals',
      'validators',
      'search',
      'block/1',
      'block/ab/txs',
      'rawblock/ab',
      'tx/ab',
      'rawtx/ab',
      'address/X1',
      'address/X1/txs',
      'address/X1/utxos',
      'proposal/ab',
      'proposal/ab/votes',
      'validator/ab',
    ]) {
      const res = await get(`/x/hy/testnet/${p}`)
      assert.equal(res.status, 200, p)
    }
  })

  it('drops unknown parameters, keeps one value of each, and bounds the query', async () => {
    reset(() => Response.json({}))
    await get('/x/hy/mainnet/blocks?utm=1&limit=5&bust=abc&cursor=ff&limit=9&x[]=1')
    assert.equal(upstreamCalls[0].url, 'https://hy.kw.vg/api/v1/blocks?cursor=ff&limit=5')
    await get('/x/hy/mainnet/blocks?cb=1')
    await get('/x/hy/mainnet/blocks?cb=2')
    assert.equal(upstreamCalls[1].url, upstreamCalls[2].url)
    assert.equal(upstreamCalls[1].url, 'https://hy.kw.vg/api/v1/blocks')
    const count = upstreamCalls.length
    assert.equal((await get(`/x/hy/mainnet/search?q=${'a'.repeat(600)}`)).status, 400)
    assert.equal((await get(`/x/hy/mainnet/blocks?junk=${'a'.repeat(2000)}`)).status, 400)
    assert.equal(upstreamCalls.length, count)
  })

  it('rejects encoded dot segments and slashes', async () => {
    reset()
    for (const p of ['%2e%2e/status', '%2E%2E%2Fstatus', 'block%2f1', '.']) {
      const { status } = await get(`/x/hy/mainnet/${p}`)
      assert.ok(status === 400 || status === 404, `${p} -> ${status}`)
    }
    assert.equal(upstreamCalls.length, 0)
  })

  it('does not cache upstream errors', async () => {
    reset(
      () =>
        new Response('{"error":"boom"}', {
          status: 500,
          headers: { 'content-type': 'application/json' },
        }),
    )
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

describe('hyphen batch', () => {
  it('answers several reads in one request, in order, each through the pass-through', async () => {
    reset((req) => {
      const u = new URL(req.url)
      if (u.pathname.endsWith('/status')) return Response.json({ blockHeight: 7 })
      if (u.pathname.includes('/missing')) return Response.json({ error: 'nope' }, { status: 404 })
      return Response.json({ path: u.pathname, search: u.search }, { headers: { etag: '"e"' } })
    })
    const r = ['status', 'address/Xa/utxos?limit=100&junk=1', 'tx/missing', 'nonsense/path']
    const res = await get(
      `/x/hy/mainnet/batch?${r.map((p) => `r=${encodeURIComponent(p)}`).join('&')}`,
    )
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('cache-control'), 'no-store')
    assert.equal(res.headers.get('content-security-policy'), "default-src 'none'; sandbox")
    const { results } = await res.json()
    assert.equal(results.length, 4)
    assert.deepEqual(results[0], { status: 200, body: { blockHeight: 7 }, headers: {} })
    assert.deepEqual(results[1], {
      status: 200,
      body: { path: '/api/v1/address/Xa/utxos', search: '?limit=100' },
      headers: { etag: '"e"' },
    })
    assert.equal(results[2].status, 404)
    assert.deepEqual(results[3], { status: 404, body: { error: 'unknown_path' } })
    assert.deepEqual(upstreamCalls.map((c) => c.url).sort(), [
      'https://hy.kw.vg/api/v1/address/Xa/utxos?limit=100',
      'https://hy.kw.vg/api/v1/status',
      'https://hy.kw.vg/api/v1/tx/missing',
    ])
  })

  it('refuses the stream, an empty batch, too many reads, and another network', async () => {
    reset(() => Response.json({}))
    const one = await (await get('/x/hy/testnet/batch?r=stream&r=status')).json()
    assert.equal(one.results[0].status, 400)
    assert.equal(one.results[1].status, 200)
    assert.equal(upstreamCalls[0].url, 'https://ts.kw.vg/api/v1/status')
    assert.equal((await get('/x/hy/mainnet/batch')).status, 400)
    const many = Array.from({ length: 17 }, () => 'r=status').join('&')
    assert.equal((await get(`/x/hy/mainnet/batch?${many}`)).status, 400)
    assert.equal((await get('/x/hy/devnet/batch?r=status')).status, 404)
  })

  it('answers a read that throws with its own 502 and keeps the others', async () => {
    reset(() => Response.json({ ok: true }))
    const res = await get(`/x/hy/mainnet/batch?r=status&r=${encodeURIComponent('http://[x')}`)
    assert.equal(res.status, 200)
    const { results } = await res.json()
    assert.deepEqual(results[0].body, { ok: true })
    assert.deepEqual(results[1], { status: 502, body: { error: 'upstream_unavailable' } })
  })

  it('reads a path named twice once, and forwards no validators to the reads', async () => {
    reset(() => Response.json({ ok: true }))
    const res = await get('/x/hy/mainnet/batch?r=status&r=status', {
      headers: { 'if-none-match': '"abc"', cookie: 'a=b' },
    })
    const { results } = await res.json()
    assert.equal(results.length, 2)
    assert.deepEqual(results[0], results[1])
    assert.equal(upstreamCalls.length, 1)
    assert.equal(upstreamCalls[0].headers.get('if-none-match'), null)
    assert.equal(upstreamCalls[0].headers.get('cookie'), null)
  })
})

describe('sources batch', () => {
  const batch = (reads, init) =>
    get(`/x/batch?${reads.map((r) => `r=${encodeURIComponent(r)}`).join('&')}`, init)
  /** The answer's lines, put back in the order the reads were named. */
  const results = async (res) => {
    assert.equal(res.headers.get('content-type'), 'application/x-ndjson')
    const lines = (await res.text())
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l))
    return lines
      .sort((a, b) => a.i - b.i)
      .map((line) => {
        const r = { ...line }
        delete r.i
        return r
      })
  }

  it('answers Hyphen, Radar and Platform Explorer reads in one request, a line each', async () => {
    reset((req) => {
      const u = new URL(req.url)
      return Response.json({ host: u.host, path: u.pathname, search: u.search })
    })
    const res = await batch([
      'hy/mainnet/status',
      'radar/mainnet/summary',
      'radar/status',
      'pe/mainnet/blocks?limit=10&order=desc',
      'pe/testnet/identity/Bjix',
    ])
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('cache-control'), 'no-store')
    assert.deepEqual(
      (await results(res)).map((r) => [r.status, `${r.body.host}${r.body.path}${r.body.search}`]),
      [
        [200, 'hy.kw.vg/api/v1/status'],
        [200, 'radar.dashhq.org/api/v1/mainnet/summary'],
        [200, 'radar.dashhq.org/api/v1/status'],
        [200, 'api.pe.dashhq.org/blocks?limit=10&order=desc'],
        [200, 'api.testnet.pe.dashhq.org/identity/Bjix'],
      ],
    )
    for (const call of upstreamCalls) assert.match(call.headers.get('user-agent') ?? '', /^Radar\//)
  })

  it('answers only the reads of a source that is down with an error', async () => {
    reset((req) => {
      const u = new URL(req.url)
      if (u.host === 'radar.dashhq.org') return new Response('down', { status: 503 })
      if (u.host === 'api.pe.dashhq.org') throw new TypeError('connection refused')
      return Response.json({ ok: true }, { status: 200 })
    })
    const [radar, pe, hy] = await results(
      await batch(['radar/mainnet/summary', 'pe/mainnet/status', 'hy/mainnet/status']),
    )
    assert.deepEqual(radar, { status: 503, body: { error: 'upstream_error' } })
    // Miniflare answers a throwing outbound handler with a 500; a real network failure is a 502.
    assert.ok(pe.status >= 500 && pe.body.error.startsWith('upstream_'))
    assert.deepEqual(hy.body, { ok: true })
  })

  it('carries only reads the app makes, and names the rest not_batched without asking anyone', async () => {
    reset(() => Response.json({ ok: true }))
    const answered = await results(
      await batch([
        'radar/mainnet/masternodes/../../admin',
        'radar/mainnet/secret',
        'pe/mainnet/admin/users',
        'pe/devnet/status',
        'pe/__proto__/status',
        'insight/mainnet/status',
        'pe/mainnet/contestedResource/a%2F..%2Fx',
        'radar/mainnet/history?dim=totals&scope=all&days=30',
        'pe/mainnet/identity/Bjix/documents?limit=10',
        'pe/mainnet/contestedResource/WyJkYXNoIiwiYWxpY2UiXQ%3D%3D/votes',
      ]),
    )
    assert.deepEqual(
      answered.map((r) => (r.status === 400 ? r.body.error : r.status)),
      [...Array(7).fill('not_batched'), 200, 200, 200],
    )
    assert.deepEqual(upstreamCalls.map((c) => c.url).sort(), [
      'https://api.pe.dashhq.org/contestedResource/WyJkYXNoIiwiYWxpY2UiXQ%3D%3D/votes',
      'https://api.pe.dashhq.org/identity/Bjix/documents?limit=10',
      'https://radar.dashhq.org/api/v1/mainnet/history?dim=totals&scope=all&days=30',
    ])
  })

  it('refuses a body that is not JSON, a redirect, an empty or oversized batch, and any method but GET', async () => {
    reset((req) =>
      new URL(req.url).pathname.endsWith('/geo')
        ? new Response('<html>', { headers: { 'content-type': 'text/html' } })
        : new Response(null, { status: 302, headers: { location: 'https://evil.example/' } }),
    )
    const [html, moved] = await results(await batch(['radar/mainnet/geo', 'radar/status']))
    assert.deepEqual(html, { status: 502, body: { error: 'bad_upstream_type' } })
    assert.deepEqual(moved, { status: 502, body: { error: 'bad_upstream_type' } })
    assert.ok(upstreamCalls.every((c) => !c.url.includes('evil.example')))
    assert.equal((await get('/x/batch')).status, 400)
    assert.equal((await batch(Array.from({ length: 17 }, () => 'radar/status'))).status, 400)
    assert.equal((await get('/x/batch?r=radar%2Fstatus', { method: 'POST' })).status, 405)
  })
})

describe('redirects', () => {
  const check = async (host, p, expected) => {
    const res = await mf.dispatchFetch(`http://${host}${p}`, { redirect: 'manual' })
    if (expected === null) {
      assert.notEqual(res.status, 301, `${host}${p} should not redirect`)
    } else {
      assert.ok([301, 302].includes(res.status), `${host}${p}`)
      assert.equal(res.headers.get('location'), expected, `${host}${p}`)
    }
  }

  it('maps the native explorer paths and keeps mainnet when a link names no network', async () => {
    const h = 'explorer.dashhq.org'
    await check(h, '/identity/?id=ABC&tab=keys', '/identity/ABC?tab=keys')
    await check(h, '/identity/?id=ABC&network=mainnet', '/identity/ABC')
    await check(
      h,
      '/identity/lookup/?pkh=ff&network=testnet',
      '/identity/lookup?pkh=ff&network=testnet',
    )
    await check(h, '/contract/?id=C1', '/contract/C1')
    await check(
      h,
      '/contract/documents/?id=C1&type=note&limit=10',
      '/contract/C1/documents/note?limit=10',
    )
    await check(h, '/contract/document/?id=C1&type=note&docId=D1', '/document/C1/note/D1')
    await check(h, '/token/?id=T1&network=mainnet', '/token/T1')
    await check(h, '/token/holders/?id=T1', '/token/T1/holders')
    await check(h, '/dpns/?name=alice.dash', '/name/alice')
    await check(h, '/evonode/?proTxHash=ab12&network=mainnet', '/mn/ab12?tab=platform')
    await check(h, '/epoch/detail/?index=5', '/epoch/5')
    await check(h, '/network/status/?network=mainnet', '/status')
    await check(h, '/address/?addr=dash1x', '/platform-address/dash1x')
    await check(h, '/state-transition/?hash=AB', '/platform/tx/AB')
    await check(h, '/tools/?tool=state-transition', '/tools/transition')
    await check(h, '/tools/?tool=proof', '/tools/proof')
    await check(h, '/tools/?tool=path-elements', '/tools/path')
    await check(
      h,
      '/governance/contested/detail/?contract=C1&docType=domain&indexName=parentNameAndLabel&indexValues=%5B%22dash%22%2C%22al1ce%22%5D',
      '/contest/al1ce',
    )
    await check(h, '/governance/contested/detail/?indexValues=nope', '/contests')
    await check(
      h,
      '/governance/contested/detail/?contract=X&docType=foo&indexName=bar&indexValues=%5B%22a%22%2C%22b%22%5D',
      '/contests',
    )
    await check(
      h,
      '/governance/contested/detail/?docType=domain&indexName=parentNameAndLabel&indexValues=%255B%2522dash%2522%252C%2522al1ce%2522%255D',
      '/contest/al1ce',
    )
    await check(h, '/tools/?tool=constructor', '/tools/transition')
    await check(h, '/groups/detail/?contractId=C1&position=3', '/group/C1/3')
    await check(h, '/groups/?contractId=C1', '/groups/C1')
    await check(h, '/contract/token/?id=C1&position=0', '/contract/C1?tab=tokens')
    await check(h, '/governance/polls/?network=mainnet', '/polls?range=upcoming')
    await check(h, '/search/?q=alice', '/search?q=alice')
    await check(h, '/identity/?id=ABC&network=testnet', '/identity/ABC?network=testnet')
  })

  it('renames the native explorer tabs and keeps only the tabs the pages have', async () => {
    const h = 'explorer.dashhq.org'
    await check(h, '/identity/?id=ABC&tab=dpns&network=mainnet', '/identity/ABC?tab=names')
    await check(h, '/identity/?id=ABC&tab=bogus&network=mainnet', '/identity/ABC')
    await check(h, '/contract/?id=C1&tab=internal&network=mainnet', '/contract/C1?tab=config')
    await check(h, '/contract/?id=C1&tab=documents&network=mainnet', '/contract/C1?tab=types')
    await check(
      h,
      '/contract/document/?id=C1&type=note&docId=D1&tab=metadata&network=mainnet',
      '/document/C1/note/D1?tab=meta',
    )
    await check(
      h,
      '/contract/document/?id=C1&type=note&docId=D1&tab=history&network=mainnet',
      '/document/C1/note/D1?tab=revisions',
    )
    await check(h, '/token/?id=T1&tab=holders&network=mainnet', '/token/T1?tab=holders')
    await check(h, '/token/?id=T1&tab=status&network=mainnet', '/token/T1')
  })

  it('turns the documents browser filter, order and page cursors into the page address', async () => {
    const h = 'explorer.dashhq.org'
    const where = encodeURIComponent(
      JSON.stringify([
        ['normalizedLabel', 'startsWith', 'ali'],
        ['$ownerId', 'in', 'A, B'],
        ['age', '>=', '18'],
        ['bad', '!=', '1'],
      ]),
    )
    await check(
      h,
      `/contract/documents/?id=C1&type=domain&network=mainnet&where=${where}&order=%24createdAt%3Adesc&after=c1%2Cc2%2Cc3&limit=50`,
      '/contract/C1/documents/domain?limit=50&where=normalizedLabel%7Esw%7Eali%2C%2524ownerId%7Ein%7EA%7CB%2Cage%7Egte%7E18&order=-%24createdAt&after=c3&prev=c1%2Cc2',
    )
    await check(
      h,
      '/contract/documents/?id=C1&type=note&network=mainnet&where=%7Bnot-json&order=title%3Aasc',
      '/contract/C1/documents/note?order=title',
    )
  })

  it('maps the native polls window and name search cursors', async () => {
    const h = 'explorer.dashhq.org'
    await check(
      h,
      '/governance/polls/?window=all-upcoming&network=mainnet',
      '/polls?range=upcoming',
    )
    await check(h, '/governance/polls/?window=7d&page=2&network=mainnet', '/polls?page=2&range=7d')
    await check(h, '/governance/polls/?network=mainnet', '/polls?range=upcoming')
    await check(h, '/governance/polls/?window=__proto__&network=mainnet', '/polls?range=upcoming')
    await check(h, '/dpns/search/?q=al&after=x%2Cy&network=mainnet', '/names?q=al&after=y')
  })

  it('sends write paths to the entity page and drops signing parameters', async () => {
    const h = 'explorer.dashhq.org'
    await check(h, '/broadcast/?op=transfer&identity=ID1&network=mainnet', '/identity/ID1')
    await check(h, '/broadcast/?op=mint&token=T9', '/token/T9')
    await check(h, '/wallet/', '/about')
  })

  it('does not bounce same-path native pages to testnet, and keeps mainnet reachable', async () => {
    const h = 'explorer.dashhq.org'
    await check(h, '/search?q=x', null)
    await check(h, '/search?q=x&network=mainnet', '/search?q=x')
    await check(h, '/settings', null)
    await check(h, '/offline', null)
    const moved = await mf.dispatchFetch('http://explorer.dashhq.org/identity/?id=A', {
      redirect: 'manual',
    })
    assert.equal(moved.status, 301)
    assert.equal(moved.headers.get('location'), '/identity/A')
    const legacy = await mf.dispatchFetch('http://radar.localhost/block-index/5', {
      redirect: 'manual',
    })
    assert.equal(legacy.status, 301)
  })

  it('serves the app at /offline instead of sending it home @NX-77', async () => {
    const res = await get('/offline')
    assert.equal(res.status, 200)
    const native = await mf.dispatchFetch('http://explorer.dashhq.org/offline', {
      redirect: 'manual',
    })
    assert.equal(native.status, 200)
  })

  it('serves the app for ids that contain dots', async () => {
    const res = await get('/name/alice.dash')
    assert.equal(res.status, 200)
    assert.match(await res.text(), /<div id="root">/)
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
    await check('radar.localhost', '/mn.html', '/masternodes')
    await check(
      'radar.localhost',
      '/mn/' + 'c'.repeat(64) + '?net=testnet',
      '/mn/' + 'c'.repeat(64) + '?network=testnet',
    )
    await check('radar.localhost', '/map?net=testnet&q=x', '/map?q=x&network=testnet')
  })

  it('keeps the list and map filters that name an autonomous system, a version, readiness or a page', async () => {
    await check('radar.localhost', '/masternodes?host=24940&version=24.0.0&dkg=ready&page=2', null)
    await check('radar.localhost', '/map?host=24940,16509&version=24.0.0', null)
    await check('radar.localhost', '/masternodes?host=Hetzner&page=2', '/masternodes?page=2')
    await check(
      'radar.localhost',
      '/masternodes?host=24940&dir=asc&page=2&sort=version',
      '/masternodes?sort=version',
    )
  })

  it('translates the old Radar list, map and changes parameters', async () => {
    await check(
      'radar.localhost',
      '/masternodes?sort=uptime_7d&dir=desc&type=Evo&status=Unreachable',
      '/masternodes?sort=-uptime_7d&type=evo&reach=unreachable',
    )
    await check('radar.localhost', '/map?layer=nodes&type=Regular', '/map?layer=nodes&type=regular')
    await check('radar.localhost', '/map?layer=mn', '/map')
    await check('radar.localhost', '/changes?kind=bogus', '/changes')
    await check('radar.localhost', '/changes?kind=pose', null)
    await check('radar.localhost', '/tools/fees', '/mempool')
    await check('explorer.dashhq.org', '/tools/fees/', '/mempool')
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
  const BOT = { headers: { 'user-agent': 'Slackbot-LinkExpanding 1.0' } }
  const getAsBot = (p) => get(p, BOT)
  const protx = 'e'.repeat(64)
  const identity = 'BjixEUbqeUZK7BRdqtLgjzwFBovx4BRwS2iwhMriiYqp'

  it('fills title and OG tags from one backend read', async () => {
    reset(() => Response.json({ type: 'Evo', status: 'enabled', version: '24.0.0', country: 'DE' }))
    const res = await getAsBot(`/mn/${protx}`)
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

  it("gives crawlers a masternode's generic tags, without reading radar.dashhq.org", async () => {
    reset(() => Response.json({ type: 'Evo', status: 'enabled', version: '24.0.0', country: 'DE' }))
    for (const ua of [
      'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Reflectionbot/1.0; +https://reflection.ai/bot) Chrome/151.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36 (compatible; meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler))',
      'Mozilla/5.0 (compatible; SemrushBot/7~bl; +http://www.semrush.com/bot.html)',
    ]) {
      const html = await (await get(`/mn/${protx}`, { headers: { 'user-agent': ua } })).text()
      assert.match(html, /<title>Masternode eeeeeeee…eeeeee · Radar<\/title>/, ua)
    }
    assert.equal(upstreamCalls.length, 0)
  })

  it('uses the testnet backends for ?network=testnet', async () => {
    reset(() =>
      Response.json({ blockHeight: 1234567, txCount: 3, blockTime: '2026-11-10T00:00:00Z' }),
    )
    const res = await getAsBot('/block/1234567?network=testnet')
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
    const html = await (await getAsBot(`/identity/${identity}`)).text()
    assert.equal(upstreamCalls[0].url, `https://api.pe.dashhq.org/identity/${identity}`)
    assert.match(html, /<title>Identity pshenmic\.dash · Radar<\/title>/)
  })

  it('escapes backend text', async () => {
    reset(() =>
      Response.json({ name: '"><script>alert(1)</script>', description: '<img src=x onerror=1>' }),
    )
    const html = await (await getAsBot(`/contract/${identity}`)).text()
    assert.doesNotMatch(html, /<script>alert/)
    assert.doesNotMatch(html, /<img src=x/)
    assert.match(html, /&lt;script&gt;/)
  })

  it('names the entity from the address when the backend fails, and falls back to the kind alone when the id is malformed', async () => {
    reset(() => new Response('boom', { status: 500 }))
    let html = await (await getAsBot(`/token/${identity}`)).text()
    assert.match(html, /<title>Token \S+…\S+ · Radar<\/title>/)
    reset()
    html = await (await getAsBot('/tx/not-a-txid')).text()
    assert.match(html, /<title>Transaction · Radar<\/title>/)
    assert.equal(upstreamCalls.length, 0)
    reset(() => {
      throw new Error('timeout')
    })
    html = await (await getAsBot(`/mn/${protx}`)).text()
    assert.match(html, /<title>Masternode \S+…\S+ · Radar<\/title>/)
    const tx = 'a'.repeat(64)
    html = await (await getAsBot(`/tx/${tx}`)).text()
    assert.match(html, /<title>Transaction aaaaaaaa…aaaaaa · Radar<\/title>/)
    html = await (await getAsBot('/block/2570010')).text()
    assert.match(html, /<title>Block 2,570,010 · Radar<\/title>/)
    html = await (await getAsBot(`/block/${tx}`)).text()
    assert.match(html, /<title>Block aaaaaaaa…aaaaaa · Radar<\/title>/)
  })

  it('previews an address from the address alone, with no backend read', async () => {
    reset(() => new Response('boom', { status: 500 }))
    const addr = 'Xbuboxzf25x1oHuaddSgUe6qmQK48Pipv1'
    const html = await (await getAsBot(`/address/${addr}`)).text()
    assert.match(html, /<title>Address Xbuboxzf…8Pipv1 · Radar<\/title>/)
    assert.match(html, /og:title" content="Address Xbuboxzf…8Pipv1 · Radar"/)
    assert.equal(upstreamCalls.length, 0)
    const bad = await (await getAsBot('/address/not-an-address')).text()
    assert.match(bad, /<title>Address · Radar<\/title>/)
  })

  it('reads no hosted backend for a Decentralized only link, and keeps the parameter in the canonical address', async () => {
    reset(() => Response.json({ blockHeight: 1, txCount: 1 }))
    for (const [route, title] of [
      [`/mn/${protx}`, 'Masternode'],
      ['/block/1234567', 'Block'],
      [`/tx/${'a'.repeat(64)}`, 'Transaction'],
      [`/identity/${identity}`, 'Identity'],
    ]) {
      const html = await (await getAsBot(`${route}?network=testnet&sources=decentralized`)).text()
      assert.match(html, new RegExp(`<title>${title} \\S+ · Radar</title>`), route)
      assert.match(
        html,
        new RegExp(
          `og:url" content="http://radar\\.localhost${route}\\?network=testnet&amp;sources=decentralized"`,
        ),
        route,
      )
    }
    const html = await (await getAsBot('/block/1234567?sources=decentralized')).text()
    assert.match(
      html,
      /og:url" content="http:\/\/radar\.localhost\/block\/1234567\?sources=decentralized"/,
    )
    assert.equal(upstreamCalls.length, 0)
  })

  describe('Platform entities', () => {
    const hash = 'c'.repeat(64)
    const contract = 'D'.repeat(44)
    const doc = 'E'.repeat(44)
    const address = 'dash1k2gwmxl4sy6qrq6xgwk2z4mxd8hdq7zk4r'
    const reads = async (path, body) => {
      reset(() => Response.json(body))
      const html = await (await getAsBot(path)).text()
      return { html, url: upstreamCalls[0]?.url, calls: upstreamCalls.length }
    }

    it('names an epoch by its number, start and transitions', async () => {
      const r = await reads('/epoch/42', {
        epoch: { number: 42, startTime: Date.UTC(2026, 9, 1) },
        totalTxCount: 1234,
      })
      assert.equal(r.url, 'https://api.pe.dashhq.org/epoch/42')
      assert.match(r.html, /<title>Epoch 42 · Radar<\/title>/)
      assert.match(r.html, /og:description" content="starts 2026-10-01 · 1,234 transactions"/)
    })

    it('keeps what names a quorum or a custom contest in the canonical address', async () => {
      reset(() => Response.json({}))
      let html = await (await getAsBot(`/quorums?q=${hash}`)).text()
      assert.match(
        html,
        new RegExp(`og:url" content="http://radar\\.localhost/quorums\\?q=${hash}"`),
      )
      html = await (
        await getAsBot(`/contest/x?contract=${contract}&type=widget&index=byName`)
      ).text()
      assert.match(
        html,
        /og:url" content="[^"]*\/contest\/x\?contract=D+&amp;type=widget&amp;index=byName"/,
      )
    })

    it('names a name from its address without asking a backend', async () => {
      const r = await reads('/name/alice', {})
      assert.equal(r.calls, 0)
      assert.match(r.html, /<title>Name alice\.dash · Radar<\/title>/)
      assert.match(r.html, /<div id="root">/)
    })

    it('describes a contest from its status and votes, and keeps a custom one generic', async () => {
      const r = await reads('/contest/alice?network=testnet', {
        status: 'Active',
        totalCountVotes: 3,
        endTimestamp: '2026-11-20T00:00:00Z',
      })
      assert.equal(
        r.url,
        `https://api.testnet.pe.dashhq.org/contestedResource/${encodeURIComponent(btoa('["dash","alice"]'))}`,
      )
      assert.match(r.html, /<title>Contest alice\.dash · Radar<\/title>/)
      assert.match(r.html, /og:description" content="Active · 3 votes · ends 2026-11-20"/)
      const custom = await reads(`/contest/gold?contract=${contract}&type=note&index=byName`, {})
      assert.equal(custom.calls, 0)
      assert.match(custom.html, /<title>Name contest gold\.dash · Radar<\/title>/)
    })

    it('describes a document from its three-part address', async () => {
      const r = await reads(`/document/${contract}/note/${doc}`, {
        documentTypeName: 'note',
        revision: 2,
      })
      const url = new URL(r.url)
      assert.equal(url.pathname, `/document/${doc}`)
      assert.equal(url.searchParams.get('contract_id'), contract)
      assert.equal(url.searchParams.get('document_type_name'), 'note')
      assert.match(r.html, /<title>Document note EEEEEEEE…EEEEEE · Radar<\/title>/)
      assert.match(r.html, /og:description" content="note · revision 2"/)
    })

    it('describes a Platform block by hash or by height', async () => {
      const header = { height: 4321, timestamp: '2026-11-10T00:00:00Z' }
      const byHash = await reads(`/platform/block/${hash}`, { header, txs: [{}, {}] })
      assert.equal(byHash.url, `https://api.pe.dashhq.org/block/${hash}`)
      assert.match(byHash.html, /<title>Platform block 4,321 · Radar<\/title>/)
      assert.match(byHash.html, /og:description" content="2 transitions · 2026-11-10T00:00:00Z"/)
      const byHeight = await reads('/platform/block/4321', { resultSet: [{ header, txs: [{}] }] })
      assert.match(byHeight.url, /\/blocks\?height_min=4321&height_max=4321&limit=1/)
      assert.match(byHeight.html, /<title>Platform block 4,321 · Radar<\/title>/)
      const absent = await reads('/platform/block/9999999', { resultSet: [] })
      assert.match(absent.html, /<title>Platform block · Radar<\/title>/)
    })

    it('describes a state transition by type, status and block', async () => {
      const r = await reads(`/platform/tx/${hash}`, {
        type: 'DocumentsBatch',
        status: 'SUCCESS',
        blockHeight: 77,
      })
      assert.equal(r.url, `https://api.pe.dashhq.org/transaction/${hash}`)
      assert.match(r.html, /<title>State transition cccccccc…cccccc · Radar<\/title>/)
      assert.match(r.html, /og:description" content="DocumentsBatch · SUCCESS · block 77"/)
    })

    it('describes a Platform address by its balance', async () => {
      const r = await reads(`/platform-address/${address}`, { balance: '250000000000' })
      assert.equal(r.url, `https://api.pe.dashhq.org/platformAddress/${address}/info`)
      assert.match(r.html, /<title>Platform address dash1k2g…q7zk4r · Radar<\/title>/)
      assert.match(r.html, /og:description" content="2\.5 DASH on Platform"/)
    })

    it('finds a quorum in the list by the hash in the address', async () => {
      const r = await reads(`/quorums?q=${hash}`, [
        { type: 'llmq_25_67', quorumHash: 'd'.repeat(64) },
        { type: 'llmq_100_67', quorumHash: hash, numValidMembers: 98, blockHeight: 2400000 },
      ])
      assert.equal(r.url, 'https://api.pe.dashhq.org/quorums')
      assert.match(r.html, /<title>Quorum cccccccc…cccccc · Radar<\/title>/)
      assert.match(
        r.html,
        /og:description" content="llmq_100_67 · 98 valid members · height 2400000"/,
      )
      const none = await reads(`/quorums?q=${'e'.repeat(64)}`, [{ type: 'x', quorumHash: hash }])
      assert.match(none.html, /<title>Quorum · Radar<\/title>/)
      const plain = await reads('/quorums', [])
      assert.equal(plain.calls, 0)
      assert.doesNotMatch(plain.html, /og:title/)
    })

    it('falls back to a generic description when the backend fails or the id is malformed', async () => {
      for (const [path, title] of [
        ['/epoch/7', 'Epoch 7'],
        [`/document/${contract}/note/${doc}`, 'Document note \\S+'],
        [`/platform/tx/${hash}`, 'State transition \\S+'],
        [`/platform-address/${address}`, 'Platform address \\S+'],
        [`/platform/block/${hash}`, 'Platform block \\S+'],
        [`/quorums?q=${hash}`, 'Quorum \\S+'],
      ]) {
        reset(() => new Response('boom', { status: 500 }))
        const html = await (await getAsBot(path)).text()
        assert.match(html, new RegExp(`<title>${title} · Radar</title>`), path)
      }
      reset()
      for (const [path, title] of [
        ['/epoch/abc', 'Epoch'],
        ['/platform/tx/zz', 'State transition'],
        ['/platform-address/notanaddress', 'Platform address'],
        ['/platform/block/xyz', 'Platform block'],
      ]) {
        const html = await (await getAsBot(path)).text()
        assert.match(html, new RegExp(`<title>${title} · Radar</title>`), path)
      }
      assert.equal(upstreamCalls.length, 0)
    })

    it('reads no hosted backend for a Decentralized only link', async () => {
      reset(() => Response.json({}))
      for (const path of ['/epoch/42', `/platform/tx/${hash}`, `/platform-address/${address}`]) {
        await getAsBot(`${path}?sources=decentralized`)
      }
      assert.equal(upstreamCalls.length, 0)
    })
  })

  it('makes no backend call for devnets or other routes', async () => {
    reset()
    await getAsBot(`/mn/${protx}?network=devnet-x`)
    await get('/masternodes')
    await get('/')
    assert.equal(upstreamCalls.length, 0)
  })

  it('answers people at once with generic tags and no backend call', async () => {
    reset(() => new Promise(() => undefined))
    for (const agent of [
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile Safari/604.1',
      '',
    ]) {
      const res = await get(`/mn/${protx}`, { headers: { 'user-agent': agent } })
      const html = await res.text()
      assert.match(html, /<title>Masternode \S+…\S+ · Radar<\/title>/, agent)
      assert.match(html, /<div id="root">/)
      assert.match(res.headers.get('vary'), /user-agent/i)
    }
    assert.equal(upstreamCalls.length, 0)
  })

  it('looks the entity up for link-preview and search crawlers', async () => {
    for (const agent of [
      'Twitterbot/1.0',
      'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
      'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
      'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
      'LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +https://www.linkedin.com)',
      'TelegramBot (like TwitterBot)',
      'WhatsApp/2.23.20.0 A',
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
    ]) {
      reset(() =>
        Response.json({ type: 'Evo', status: 'enabled', version: '24.0.0', country: 'DE' }),
      )
      const html = await (await get(`/mn/${protx}`, { headers: { 'user-agent': agent } })).text()
      assert.equal(upstreamCalls.length, 1, agent)
      assert.match(upstreamCalls[0].headers.get('user-agent'), /^Radar\//, agent)
      assert.match(html, /<title>Evonode eeeeeeee…eeeeee · Radar<\/title>/, agent)
    }
  })
})

describe('fetchFirstData', () => {
  it('answers while Hyphen and its own deadline are both still pending', async () => {
    const { build } = createRequire(
      realpathSync(path.join(root, 'node_modules/wrangler/package.json')),
    )('esbuild')
    const out = await build({
      entryPoints: [path.join(root, 'src/first-data.ts')],
      bundle: true,
      format: 'esm',
      platform: 'neutral',
      write: false,
    })
    const { fetchFirstData } = await import(
      `data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`
    )
    const saved = { fetch: globalThis.fetch, caches: globalThis.caches }
    let asked = 0
    globalThis.fetch = () => {
      asked += 1
      return new Promise(() => {})
    }
    globalThis.caches = { default: { match: async () => undefined, put: async () => {} } }
    const later = []
    try {
      const data = await fetchFirstData(
        'https://radar.test',
        { net: 'mainnet', kind: 'tx', id: 'ab'.repeat(32) },
        { waitUntil: (p) => later.push(p) },
        { budgetMs: 3_600_000, warm: true },
      )
      assert.equal(data, null)
      assert.ok(asked > 0)
      const pending = Symbol('pending')
      for (const p of later)
        assert.equal(await Promise.race([p, Promise.resolve(pending)]), pending)
    } finally {
      globalThis.fetch = saved.fetch
      globalThis.caches = saved.caches
    }
  })
})
