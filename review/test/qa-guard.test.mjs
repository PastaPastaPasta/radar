/* global createImageBitmap, OffscreenCanvas */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { chromium } from '../lib/playwright.mjs'
import { installQaGuard, matchRule, newGuardedContext } from '../qa-guard.mjs'

let browser

before(async () => {
  browser = await chromium.launch()
})
after(async () => {
  await browser?.close()
})

const fakeRequest = (url, method = 'POST', body = '') => ({
  url: () => url,
  method: () => method,
  postDataBuffer: () => (body ? Buffer.from(body) : null),
})

describe('matchRule', () => {
  it('blocks every broadcast RPC shape', () => {
    const cases = [
      [
        'https://seed-1.evonet.networks.dash.org:1443/org.dash.platform.dapi.v0.Platform/broadcastStateTransition',
        'POST',
        '',
      ],
      ['https://dapi.example/org.dash.platform.dapi.v0.Core/broadcastTransaction', 'POST', ''],
      ['https://insight.dash.org/insight-api/tx/send', 'POST', 'rawtx=00'],
      ['https://insight.testnet.networks.dash.org/insight-api/tx/send', 'POST', 'rawtx=00'],
      ['https://api.pe.dashhq.org/transaction/broadcast', 'POST', '{"hex":"00"}'],
      ['https://api.testnet.pe.dashhq.org/transactions/broadcast', 'POST', ''],
      ['https://rpc.example/', 'POST', '{"method":"broadcastStateTransition"}'],
      ['https://rpc.example/', 'POST', '{"method":"sendrawtransaction","params":["00"]}'],
    ]
    for (const [url, method, body] of cases)
      assert.ok(matchRule(fakeRequest(url, method, body)), url)
  })

  it('blocks encoded paths and GET broadcasts, not look-alike reads', () => {
    assert.ok(matchRule(fakeRequest('https://insight.dash.org/insight-api/tx/%73end', 'POST')))
    assert.ok(
      matchRule(fakeRequest('https://api.pe.dashhq.org/transaction/broadcast?hex=00', 'GET')),
    )
    assert.equal(
      matchRule(
        fakeRequest(
          'https://radar.dashhq.org/sdk-reference?method=broadcastStateTransition',
          'GET',
        ),
      ),
      null,
    )
    assert.equal(
      matchRule(fakeRequest('https://radar.dashhq.org/assets/broadcastTransaction-ab12.js', 'GET')),
      null,
    )
  })

  it('lets reads through', () => {
    const cases = [
      ['https://api.pe.dashhq.org/transactions?limit=5', 'GET'],
      ['https://api.pe.dashhq.org/transaction/verify', 'POST'],
      ['https://insight.dash.org/insight-api/tx/abc', 'GET'],
      ['https://dapi.example/org.dash.platform.dapi.v0.Platform/getIdentity', 'POST'],
      ['https://radar.dashhq.org/api/v1/mainnet/masternodes', 'GET'],
    ]
    for (const [url, method] of cases) assert.equal(matchRule(fakeRequest(url, method)), null, url)
  })
})

describe('installQaGuard', () => {
  const html = `<!doctype html><textarea id="phrase" placeholder="Recovery phrase"></textarea>
    <input type="password" id="pw"><input type="search" id="page-search">
    <input aria-label="Search Radar" id="palette-input"><input id="visible" value="public">`

  it('blocks and logs broadcasts in a real browser, allows reads', async () => {
    const context = await browser.newContext({ serviceWorkers: 'block' })
    await context.route('https://site.test/**', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: html,
        headers: { 'access-control-allow-origin': '*' },
      }),
    )
    const guard = await installQaGuard(context, { logFile: undefined })
    const page = await context.newPage()
    await page.goto('https://site.test/')
    const result = await page.evaluate(async () => {
      const send = (url, init) => fetch(url, init).then((r) => r.status)
      return {
        insight: await send('https://insight.dash.org/insight-api/tx/send', {
          method: 'POST',
          body: 'rawtx=00',
        }),
        dapi: await send(
          'https://d.test/org.dash.platform.dapi.v0.Platform/broadcastStateTransition',
          { method: 'POST', body: 'x' },
        ),
        pe: await send('https://api.pe.dashhq.org/transaction/broadcast', {
          method: 'POST',
          body: '{}',
        }),
        read: await send('https://site.test/ok'),
      }
    })
    assert.equal(result.insight, 403)
    assert.equal(result.dapi, 403)
    assert.equal(result.pe, 403)
    assert.notEqual(result.read, 403)
    assert.deepEqual(
      guard.blocked.map((b) => b.rule),
      ['insight-tx-send', 'dapi-broadcastStateTransition', 'pe-broadcast'],
    )
    assert.equal(guard.blocked[0].page, 'https://site.test/')
    await context.close()
  })

  it('masks recovery-phrase, password and search fields in screenshots', async () => {
    const { context } = await newGuardedContext(browser)
    await context.route('https://site.test/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: html }),
    )
    const page = await context.newPage()
    await page.setViewportSize({ width: 400, height: 200 })
    await page.goto('https://site.test/')
    await page.locator('#phrase').fill('abandon abandon abandon')
    const area = async (selector) => {
      const box = await page.locator(selector).boundingBox()
      return { x: box.x + 4, y: box.y + 4, width: 12, height: 12 }
    }
    const darkness = async (clip) => {
      const png = await page.screenshot({ clip })
      return page.evaluate(async (b64) => {
        const bmp = await createImageBitmap(
          await (await fetch(`data:image/png;base64,${b64}`)).blob(),
        )
        const c = new OffscreenCanvas(bmp.width, bmp.height).getContext('2d')
        c.drawImage(bmp, 0, 0)
        const d = c.getImageData(0, 0, bmp.width, bmp.height).data
        let sum = 0
        for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2]
        return sum / ((d.length / 4) * 3 * 255)
      }, png.toString('base64'))
    }
    assert.equal(await darkness(await area('#phrase')), 0)
    assert.equal(await darkness(await area('#pw')), 0)
    assert.equal(await darkness(await area('#page-search')), 0)
    assert.equal(await darkness(await area('#palette-input')), 0)
    assert.ok((await darkness(await area('#visible'))) > 0.5)
    await context.close()
  })
})
