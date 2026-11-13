import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Page } from '@playwright/test'
import { expectAccessible } from '../helpers/a11y'
import { settled } from '../helpers/settled'
import { expect, test } from '../helpers/test'

const VECTORS = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'apps/web/src/features/tools/decoders/vectors',
)

interface Vector {
  id: string
  kind: string
  hex: string
  contractHex?: string
  type?: string
  expected: unknown
}

const vector = (id: string): Vector =>
  JSON.parse(readFileSync(path.join(VECTORS, `${id}.json`), 'utf8')) as Vector

const DPNS = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec'
const run = (page: Page) => page.getByRole('button', { name: 'Run', exact: true })
const editor = (page: Page) => page.getByRole('textbox', { name: 'SQL query' })

/** The calls the SDK client has been asked to make since the page loaded. */
const sdkCalls = (page: Page): Promise<string[]> =>
  page.evaluate(() => (window as unknown as { __calls: string[] }).__calls)

/**
 * Fixture builds have no wasm, so their SDK transport cannot decode. This stands the recorded decoding of each
 * vector in its place, keyed by the bytes it was recorded from, and writes every SDK call to `__calls`.
 */
async function stubSdk(page: Page, vectors: Vector[]): Promise<void> {
  await page.addInitScript((table) => {
    const w = window as unknown as Record<string, unknown>
    w.__calls = [] as string[]
    w.__decodes = [] as unknown[]
    let sdk: Record<string, unknown> | undefined
    Object.defineProperty(window, '__radarSdk', {
      configurable: true,
      get: () => sdk,
      set(value: Record<string, unknown>) {
        sdk = value
        const call = (value.call as (...a: unknown[]) => unknown).bind(value)
        value.call = (net: string, method: string, ...rest: unknown[]) => {
          ;(w.__calls as string[]).push(method)
          return call(net, method, ...rest)
        }
        value.decode = (
          kind: string,
          bytes: Uint8Array,
          opts?: { type?: string; contract?: Uint8Array },
        ) => {
          const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
          ;(w.__decodes as unknown[]).push({
            kind,
            length: bytes.length,
            type: opts?.type ?? null,
            contract: opts?.contract?.length ?? null,
          })
          const hit = table.find(
            (v) => v.kind === kind && v.hex === hex && (v.type ?? null) === (opts?.type ?? null),
          )
          return Promise.resolve(
            hit
              ? { ok: true, data: hit.expected, proved: false, tookMs: 1 }
              : {
                  ok: false,
                  error: { kind: 'invalid-response', message: 'unable to deserialize' },
                },
          )
        }
      },
    })
  }, vectors)
}

/** PE's verify is a POST, which the fixture transport does not replay: answer it here, and keep what was sent. */
async function stubVerify(page: Page, answer: unknown): Promise<void> {
  await page.addInitScript((body) => {
    const w = window as unknown as { __verify: { url: string; body: string }[] }
    w.__verify = []
    const real = window.fetch.bind(window)
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url.includes('/transaction/verify') && init?.method === 'POST') {
        w.__verify.push({ url, body: typeof init.body === 'string' ? init.body : '' })
        return Promise.resolve(
          new Response(JSON.stringify(body), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        )
      }
      return real(input, init)
    }
  }, answer)
}

test.describe('query', () => {
  test('a preset runs with the button and with ctrl+enter, and the address carries the query @NX-70', async ({
    page,
  }) => {
    await stubSdk(page, [])
    await page.goto('/query')
    await expect(page.getByRole('heading', { level: 1, name: 'Query' })).toBeVisible()
    await page.locator('[data-preset="dpns-label"]').click()
    await run(page).click()
    const results = page.locator('[data-results]')
    await expect(results.getByText('pshenm1c').first()).toBeVisible()
    await expect(results.locator('[data-result-count]')).toHaveText(/1 document/)
    await expect(page).toHaveURL(/[?&]q=/)
    await expect(page).toHaveURL(new RegExp(`contract=${DPNS}`))
    const before = (await sdkCalls(page)).filter((m) => m === 'documents.query').length
    await editor(page).click()
    await page.keyboard.press('Control+Enter')
    await expect
      .poll(async () => (await sdkCalls(page)).filter((m) => m === 'documents.query').length)
      .toBe(before + 1)
    await settled(page)
    await expectAccessible(page)
  })

  test('cancel stops a statement that is still waiting @NX-70', async ({ page }) => {
    await stubSdk(page, [])
    await page.goto('/query')
    await expect(page.locator('[data-schema-type]').first()).toBeVisible()
    await page.evaluate(() => {
      const sdk = (window as unknown as { __radarSdk: Record<string, unknown> }).__radarSdk
      const call = (sdk.call as (...a: unknown[]) => Promise<unknown>).bind(sdk)
      sdk.call = (net: string, method: string, args: unknown, signal?: AbortSignal) =>
        method === 'documents.query'
          ? new Promise((_resolve, reject) => {
              signal?.addEventListener('abort', () => {
                reject(new DOMException('Aborted', 'AbortError'))
              })
            })
          : call(net, method, args, signal)
    })
    await run(page).click()
    const cancel = page.getByRole('button', { name: 'Cancel', exact: true })
    await expect(cancel).toBeEnabled()
    await cancel.click()
    await expect(page.locator('[data-results]').getByText('Cancelled')).toBeVisible()
    await expect(run(page)).toBeEnabled()
  })

  test('two statements answer one after another, and a third is refused @NX-70', async ({
    page,
  }) => {
    await stubSdk(page, [])
    await page.goto('/query')
    await editor(page).fill(
      "SELECT * FROM dpns.domain WHERE normalizedParentDomainName == 'dash' AND normalizedLabel == 'pshenm1c' LIMIT 5; SELECT * FROM dashpay.profile WHERE $ownerId == '9dQixko1C7TrmKYuZDZ8qAhgMQWT5fZ3tvyb13MVnQV6' LIMIT 10",
    )
    await run(page).click()
    await expect(page.locator('[data-statement]')).toHaveCount(2)
    await expect(page.locator('[data-result-kind="documents"]')).toHaveCount(2)
    await editor(page).fill(
      'SELECT * FROM dpns.domain; SELECT * FROM dpns.domain; SELECT * FROM dpns.domain',
    )
    await run(page).click()
    await expect(page.getByText(/Up to 2 statements/)).toBeVisible()
    await expect(page.locator('[data-query-problem="too-many"]')).toBeVisible()
  })

  test('an average over groups answers with a row for each group @NX-70', async ({ page }) => {
    await page.goto('/query?network=testnet')
    await page.locator('[data-preset="group-by"]').click()
    await run(page).click()
    const result = page.locator('[data-result-kind="avg"]')
    await expect(result).toBeVisible()
    await expect(result.locator('[data-result-count]')).toBeVisible()
    await expect(page.locator('[data-results]').getByText('Average').first()).toBeVisible()
    await expect(page.locator('[data-results]').getByText('698').first()).toBeVisible()
    await settled(page)
    await expectAccessible(page)
  })

  test('syntax it does not support is explained and nothing is sent @NX-70', async ({ page }) => {
    await stubSdk(page, [])
    await page.goto('/query')
    await expect(page.locator('[data-schema-type]').first()).toBeVisible()
    const before = (await sdkCalls(page)).filter((m) => m.startsWith('documents.')).length
    await editor(page).fill('SELECT * FROM dpns.domain JOIN other ON a = b')
    await run(page).click()
    const problem = page.locator('[data-query-problem]')
    await expect(problem).toBeVisible()
    await expect(problem).toContainText('Nothing was sent.')
    await expect(page.locator('[data-results]')).toHaveCount(0)
    expect((await sdkCalls(page)).filter((m) => m.startsWith('documents.')).length).toBe(before)
    await expectAccessible(page)
  })

  test('exports what the result holds as JSON and as CSV @NX-70', async ({ page }) => {
    await page.goto('/query')
    await page.locator('[data-preset="dpns-label"]').click()
    await run(page).click()
    await expect(page.locator('[data-results]').getByText('pshenm1c').first()).toBeVisible()
    const json = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export JSON' }).click()
    const jsonFile = await json
    expect(jsonFile.suggestedFilename()).toMatch(/\.json$/)
    const rows = JSON.parse(readFileSync((await jsonFile.path()) ?? '', 'utf8')) as {
      $id: string
      normalizedLabel: string
    }[]
    expect(rows[0]?.normalizedLabel).toBe('pshenm1c')
    const csv = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export CSV' }).click()
    const csvFile = await csv
    expect(csvFile.suggestedFilename()).toMatch(/\.csv$/)
    const text = readFileSync((await csvFile.path()) ?? '', 'utf8')
    expect(text.split('\n')[0]).toContain('id')
    expect(text).toContain('pshenm1c')
  })

  test('saved queries survive a reload, per network @NX-70', async ({ page }) => {
    await page.goto('/query')
    await page.getByLabel('Name for this query').fill('my names')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    const saved = page.locator('[data-saved-queries]')
    await expect(saved.getByRole('button', { name: 'my names', exact: true })).toBeVisible()
    await page.reload()
    await expect(
      page.locator('[data-saved-queries]').getByRole('button', { name: 'my names', exact: true }),
    ).toBeVisible()
    await page.goto('/query?network=testnet')
    await expect(page.getByText('No saved queries yet.')).toBeVisible()
  })

  test('a shared link opens with its text and contract @NX-70', async ({ page }) => {
    const sql = "SELECT * FROM domain WHERE normalizedParentDomainName == 'dash' LIMIT 3"
    await page.goto(`/query?q=${encodeURIComponent(sql)}&contract=${DPNS}`)
    await expect(editor(page)).toHaveValue(sql)
  })
})

const DECODERS: {
  decoder: string
  label: string
  id: string
  probe: (expected: Record<string, unknown>) => string
}[] = [
  {
    decoder: 'contract',
    label: 'Serialized data contract',
    id: 'contract-dpns',
    probe: (e) => String(e.id),
  },
  {
    decoder: 'identity',
    label: 'Serialized identity',
    id: 'identity-main',
    probe: (e) => String(e.id),
  },
]

test.describe('decoders', () => {
  for (const d of DECODERS) {
    test(`the ${d.decoder} decoder reads real bytes and keeps them out of the address @NX-71 @NX-72`, async ({
      page,
    }) => {
      const v = vector(d.id)
      await stubSdk(page, [v])
      await page.goto(`/tools/${d.decoder}`)
      await page.getByLabel(d.label).fill(v.hex)
      await expect(page.locator('#decoded')).toContainText(
        d.probe(v.expected as Record<string, unknown>),
      )
      expect(page.url()).not.toContain(v.hex.slice(0, 24))
      await expect(page.locator('[data-bytes-note]')).toContainText('not sent anywhere')
      await settled(page)
      await expectAccessible(page)
    })
  }

  test('the document decoder needs a contract and a type, then reads the document @NX-71 @NX-72', async ({
    page,
  }) => {
    const v = vector('document-dpns-domain')
    await stubSdk(page, [v])
    await page.goto(`/tools/document?contract=${DPNS}`)
    await page.getByLabel('Serialized document').fill(v.hex)
    await expect(page.locator('[data-needs-contract]')).toBeVisible()
    await expect(page.getByLabel('Document type')).toBeEnabled()
    await page.getByLabel('Document type').selectOption('domain')
    await expect(page).toHaveURL(/type=domain/)
    await expect(page.locator('#decoded')).toContainText('pshenm1c')
    const decodes = await page.evaluate(
      () =>
        (window as unknown as { __decodes: { kind: string; type: string; contract: number }[] })
          .__decodes,
    )
    expect(decodes.at(-1)).toMatchObject({ kind: 'document', type: 'domain' })
    expect(decodes.at(-1)?.contract).toBeGreaterThan(100)
    expect(page.url()).not.toContain(v.hex.slice(0, 24))
    await settled(page)
    await expectAccessible(page)
  })

  test('bytes that are not hex or base64 are refused with a reason @NX-71', async ({ page }) => {
    await stubSdk(page, [])
    await page.goto('/tools/identity')
    await page.getByLabel('Serialized identity').fill('this is not bytes!')
    await expect(page.locator('[data-bytes-note]')).toContainText(
      "isn't hex, base64 or a list of numbers",
    )
    expect(
      await page.evaluate(() => (window as unknown as { __decodes: unknown[] }).__decodes.length),
    ).toBe(0)
  })

  test('a name that is not a decoder lists the decoders @NX-72', async ({ page }) => {
    await page.goto('/tools/nope')
    await expect(page.getByRole('heading', { level: 1, name: 'Decoders' })).toBeVisible()
    for (const id of ['contract', 'identity', 'document', 'proof', 'path', 'transition']) {
      await expect(page.locator(`[data-decoder-link="${id}"]`)).toBeVisible()
    }
    await expectAccessible(page)
  })

  test('the proof decoder shows the layers of a real GroveDB proof @NX-72', async ({ page }) => {
    const v = vector('proof-dpns-domain-asc')
    await page.goto('/tools/proof')
    await page.getByLabel('Proof bytes').fill(v.hex)
    const layers = page.locator('[data-proof-layers] [data-proof-layer]')
    await expect(layers.first()).toBeVisible({ timeout: 20_000 })
    expect(await layers.count()).toBeGreaterThan(2)
    await layers.first().locator('summary').click()
    await expect(layers.first().locator('tbody tr').first()).toBeVisible()
    await expect(page.locator('#proof-summary')).toContainText('Proven items')
    expect(page.url()).not.toContain(v.hex.slice(0, 24))
    await settled(page)
    await expectAccessible(page)
  })

  test('a proof that is not a proof says so @NX-72', async ({ page }) => {
    await page.goto('/tools/proof')
    await page.getByLabel('Proof bytes').fill('0102030405060708')
    await expect(
      page.getByRole('alert').filter({ hasText: /GroveDB proof|ends before/ }),
    ).toBeVisible({
      timeout: 20_000,
    })
  })

  test('the path presets read the tree and name its keys @NX-72', async ({ page }) => {
    await page.goto('/tools/path?preset=root')
    const rows = page.locator('[data-path-element]')
    await expect(rows.first()).toBeVisible()
    await expect(page.locator('#path-elements')).toContainText('Identities')
    await expect(page.locator('#path-elements')).toContainText('DataContractDocuments')
    await page.getByLabel('Preset').selectOption('votes')
    await expect(page).toHaveURL(/preset=votes/)
    await expect(page.locator('#path-elements')).toContainText('ContestedResource')
    await page.getByLabel('Preset').selectOption('dpns-contract')
    await expect(page.locator('#path-elements')).toContainText('Documents tree')
    await settled(page)
    await expectAccessible(page)
  })

  test('a key that is not hex is refused before anything is asked @NX-72', async ({ page }) => {
    await stubSdk(page, [])
    await page.goto('/tools/path')
    await page.getByLabel('Keys').fill('xyz')
    await expect(page.locator('[data-path-problem]')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Read elements' })).toBeDisabled()
    expect((await sdkCalls(page)).filter((m) => m === 'system.pathElements')).toEqual([])
  })
})

test.describe('transition tool', () => {
  const create = vector('transition-document-create')

  test('decodes a transition, summarises it and never puts the bytes in the address @NX-71', async ({
    page,
  }) => {
    await stubSdk(page, [create])
    await page.goto('/tools/transition')
    await expect(page.getByRole('heading', { level: 1, name: 'Transition decoder' })).toBeVisible()
    await page.getByLabel('Signed state transition').fill(create.hex)
    const summary = page.locator('#transition-summary')
    await expect(summary).toContainText('Documents and tokens batch')
    await expect(summary.locator('[data-batch-operations]')).toContainText('chunkDoc')
    await expect(page.locator('#decoded')).toBeVisible()
    expect(page.url()).not.toContain(create.hex.slice(0, 24))
    await settled(page)
    await expectAccessible(page)
  })

  test('Platform Explorer accepts a valid transition @PE-34', async ({ page }) => {
    await stubSdk(page, [create])
    await stubVerify(page, { result: true })
    await page.goto('/tools/transition')
    await page.getByLabel('Signed state transition').fill(create.hex)
    await page.getByRole('button', { name: 'Check this transition' }).click()
    await expect(page.locator('[data-verify="valid"]')).toContainText(
      'Platform would accept this transition.',
    )
    const sent = await page.evaluate(
      () => (window as unknown as { __verify: { url: string; body: string }[] }).__verify,
    )
    expect(sent).toHaveLength(1)
    expect(JSON.parse(sent[0]!.body)).toEqual({
      base64: Buffer.from(create.hex, 'hex').toString('base64'),
    })
    expect(sent[0]!.url).not.toContain(create.hex.slice(0, 24))
    await expect(page.getByRole('link', { name: /Bridge/ })).toBeVisible()
    await expectAccessible(page)
  })

  test('Platform Explorer rejects a bad one and the reason is readable @PE-34', async ({
    page,
  }) => {
    await stubSdk(page, [create])
    await stubVerify(page, { result: false, error: 'invalid state transition signature', code: 10 })
    await page.goto('/tools/transition')
    await page.getByLabel('Signed state transition').fill(create.hex)
    await page.getByRole('button', { name: 'Check this transition' }).click()
    const outcome = page.locator('[data-verify="invalid"]')
    await expect(outcome).toContainText('Platform would reject this transition.')
    await expect(outcome).toContainText('invalid state transition signature')
    await expectAccessible(page)
  })

  test('in Decentralized only mode it still decodes and says checking needs Platform Explorer @PE-34', async ({
    page,
  }) => {
    await stubSdk(page, [create])
    await page.goto('/tools/transition?sources=decentralized')
    await page.getByLabel('Signed state transition').fill(create.hex)
    await expect(page.locator('#transition-summary')).toContainText('Documents and tokens batch')
    await expect(page.locator('#transition-verify [data-unavailable="mode"]')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Check this transition' })).toHaveCount(0)
    await expectAccessible(page)
  })

  test('the types the SDK reads only as an envelope still show it @NX-71', async ({ page }) => {
    const transfer = vector('transition-credit-transfer')
    await stubSdk(page, [transfer])
    await page.goto('/tools/transition')
    await page.getByLabel('Signed state transition').fill(transfer.hex)
    await expect(page.locator('#transition-summary')).toContainText('Credit transfer')
    await expect(page.locator('#decoded')).toContainText('IdentityCreditTransfer')
  })
})

test.describe('SDK reference', () => {
  test('maps pages to the SDK calls behind them and filters by call @NX-73', async ({ page }) => {
    await page.goto('/sdk-reference')
    await expect(page.getByRole('heading', { level: 1, name: 'SDK reference' })).toBeVisible()
    const all = await page.locator('[data-sdk-page]').count()
    expect(all).toBeGreaterThan(10)
    await page.getByLabel('Filter by page, source or call').fill('documents.count')
    await expect(page.locator('[data-sdk-page]')).toHaveCount(1)
    await expect(page.locator('[data-sdk-page="/query"]')).toContainText('documents.countWithProof')
    await expect(page).toHaveURL(/q=documents\.count/)
    await expect(page.getByRole('link', { name: 'SDK documentation' })).toHaveAttribute(
      'href',
      /evo-sdk/,
    )
    await settled(page)
    await expectAccessible(page)
  })

  test('a link with a filter opens already filtered, and a filter that matches nothing says so @NX-73', async ({
    page,
  }) => {
    await page.goto('/sdk-reference?q=system.status')
    await expect(page.locator('[data-sdk-page="/status"]')).toBeVisible()
    await page.getByLabel('Filter by page, source or call').fill('zzz-no-such-call')
    await expect(page.getByText('No page or call matches this filter.')).toBeVisible()
    await page.getByRole('button', { name: 'Clear the filter' }).click()
    await expect.poll(() => page.locator('[data-sdk-page]').count()).toBeGreaterThan(10)
  })

  test('every SDK-backed page row links to its page @NX-73', async ({ page }) => {
    await page.goto('/sdk-reference?q=system.status')
    await page.locator('[data-sdk-page="/status"]').getByRole('link').first().click()
    await expect(page).toHaveURL(/\/status/)
  })
})
