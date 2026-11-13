import { expectAccessible } from '../helpers/a11y'
import { expect as baseExpect, test } from '../helpers/test'

const expect = baseExpect.configure({ timeout: 15_000 })

const TRANSFER = '8acce06e01135b73f1acc26c8cb1084917e9bcf4a83ef1d1068df96a7c427a90'
const NO_SUCH = '0000000000000000000000000000000000000000000000000000000000000001'
const ASSET_LOCK = '2972859ef7fdc7a52397b7f844d69888414e22dcaa2be2b6e432a81c7b812cf6'
const MNHF = '46a47fe65c9fd29e9379f3f74020df33dabb1d4095c8da6b1fa05e508b74a491'

const PAYLOADS: { name: string; txid: string; kind: string; shows: string }[] = [
  {
    name: 'a coinbase payload',
    txid: 'ea25cc59f4fe3a7bac8873d0a722d995eb5ea37b47f1f83511bf2f1e888daae9',
    kind: 'cbTx',
    shows: 'Masternode list root',
  },
  {
    name: 'a quorum commitment',
    txid: '4fa48aca80dfcf1e7fa0c59eb36e15ae7470195d79185a0b9fd3f4e5c10be76b',
    kind: 'qcTx',
    shows: 'Signers',
  },
  {
    name: 'a masternode registration',
    txid: 'af68cf8494b8064085187efbb933c3a58b189ec9ef770510db7d791ea8d45251',
    kind: 'proRegTx',
    shows: 'Collateral',
  },
  {
    name: 'a masternode service update',
    txid: 'e788264d6b8e02fbb029503c43d568093e73d0119f639102410db46cc822eb51',
    kind: 'proUpServTx',
    shows: 'New service address',
  },
  {
    name: 'a masternode registrar update',
    txid: '188e7232b8f73723bb3d893a9ffd84cbdce20f859f4d42c312fad559a9fb11b7',
    kind: 'proUpRegTx',
    shows: 'New operator key',
  },
  {
    name: 'a masternode revocation',
    txid: '9f827f91edb38bffff9f4a324cde6f6c071f25d500e343401e99d028e8cb17d4',
    kind: 'proUpRevTx',
    shows: 'Reason',
  },
  {
    name: 'an asset lock',
    txid: '2972859ef7fdc7a52397b7f844d69888414e22dcaa2be2b6e432a81c7b812cf6',
    kind: 'assetLockTx',
    shows: 'Credited on Platform',
  },
  {
    name: 'an asset unlock',
    txid: '5d0c5900e0e0d260c7b952f2cf0496d274d538c755b1f56e21a72f42c315a63a',
    kind: 'assetUnlockTx',
    shows: 'Withdrawal index',
  },
]

/** A ProUpRegTx whose block is ChainLocked, with no lock in DAPI's answer or in Hyphen's record. */
const NEVER_LOCKED = '188e7232b8f73723bb3d893a9ffd84cbdce20f859f4d42c312fad559a9fb11b7'
const REVOCATION = '9f827f91edb38bffff9f4a324cde6f6c071f25d500e343401e99d028e8cb17d4'
const COINBASE = 'ff1ebb495704b3ef38bc23c85076b3282af81bcc564c8aea492b0413ab290328'
const PROREG = 'af68cf8494b8064085187efbb933c3a58b189ec9ef770510db7d791ea8d45251'
const TESTNET_TRANSFER = '92fe2c05fde07f7cb7d1e2189b352e2003f76b536e6b81d78458ac096c1e9cf6'

test.describe('Transaction page', () => {
  test('shows the fee, flow, settlement steps and both lists @IN-05', async ({ page }) => {
    await page.goto(`/tx/${TRANSFER}`)
    await expect(page.getByRole('heading', { level: 1, name: /Transaction/ })).toBeVisible()
    await expect(page.getByText('Fee').first()).toBeVisible()
    await expect(page.locator('#flow')).toBeVisible()
    await expect(page.locator('[data-step="chainlocked"]')).toBeVisible()
    await expect(page.locator('#in-0')).toBeVisible()
    await expect(page.locator('#out-0')).toBeVisible()
    await expect(page.locator('[data-source="dapi"]').first()).toBeVisible()
    await expectAccessible(page)
  })

  test('opens at an output named in the link @IN-05', async ({ page }) => {
    await page.goto(`/tx/${TRANSFER}#out-1`)
    const row = page.locator('#out-1')
    await expect(row).toBeVisible()
    await expect(row).toHaveAttribute('data-anchor', 'on')
  })

  test('copies the transaction id with feedback @IN-14', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => undefined)
    await page.goto(`/tx/${TRANSFER}`)
    const copy = page.locator('.rx-rec__meta').getByRole('button', { name: /Copy/ }).first()
    await copy.click()
    await expect(copy).toHaveClass(/is-done/)
    await expect(page.getByRole('status').filter({ hasText: 'Copied' })).toBeAttached()
  })

  test('flips the flow to a table on request @HY-07', async ({ page }) => {
    await page.goto(`/tx/${TRANSFER}`)
    await page.getByRole('button', { name: /Show as a table/ }).click()
    await expect(page.locator('#flow').getByRole('table').first()).toBeVisible()
  })

  for (const p of PAYLOADS) {
    test(`explains ${p.name} @HY-07 @IN-05`, async ({ page }) => {
      await page.goto(`/tx/${p.txid}`)
      const payload = page.locator(`[data-payload="${p.kind}"]`)
      await expect(payload).toBeVisible()
      await expect(payload).toContainText(p.shows)
    })
  }

  test('cuts a payload hash in the middle on a phone and keeps the txid whole @IN-05', async ({
    page,
  }) => {
    const phone = (page.viewportSize()?.width ?? 1000) <= 640
    await page.goto(`/tx/${PAYLOADS[0]!.txid}`)
    const payload = page.locator('[data-payload="cbTx"]')
    await expect(payload).toContainText('Masternode list root')
    await expect(page.locator('.rx-rec__meta .rx-hash[data-display="full"] code')).toHaveText(
      PAYLOADS[0]!.txid,
    )
    const cuts = payload.locator('.rx-hash-toggle')
    if (!phone) {
      await expect(cuts).toHaveCount(0)
      return
    }
    await expect(cuts.first()).toHaveText(/^[0-9a-f]{8}…[0-9a-f]{6}$/)
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })

  for (const [name, url] of [
    ['a quorum commitment', `/tx/${PAYLOADS[1]!.txid}`],
    ['a hard-fork signal', `/tx/${MNHF}?network=testnet`],
  ] as const) {
    test(`gives ${name} a zero fee and no value ribbon @HY-07`, async ({ page }) => {
      await page.goto(url)
      const fee = page.locator('.rx-stat').filter({ hasText: /^Fee/ })
      await expect(fee).toContainText('0 duffs a byte')
      await expect(fee).not.toContainText('Show all inputs')
      const flow = page.locator('#flow')
      await expect(flow).toContainText('No value moves in this transaction')
      await expect(flow.locator('svg.rx-flow')).toHaveCount(0)
      await expect(flow).not.toContainText('Credit pool')
    })
  }

  test('keeps the credit-pool ribbon on an asset unlock @HY-07', async ({ page }) => {
    await page.goto('/tx/5d0c5900e0e0d260c7b952f2cf0496d274d538c755b1f56e21a72f42c315a63a')
    await expect(page.locator('#flow svg.rx-flow')).toBeAttached()
    await expect(page.locator('#flow')).toContainText('Credit pool')
  })

  test('puts a no-break space between the size and its unit @IN-05', async ({ page }) => {
    await page.goto(`/tx/${TRANSFER}`)
    await expect(page.locator('.rx-kpis')).toContainText(/[\d,]+\u00a0bytes/)
  })

  test('puts a no-break space between every amount and its unit @IN-05', async ({ page }) => {
    await page.goto(`/tx/${TRANSFER}`)
    await expect(page.locator('#io')).toBeVisible()
    const run = await page.locator('main').evaluate((main) => {
      const text = (main as HTMLElement).innerText
      return text.match(/\d(DASH|tDASH|mDASH|µDASH|duffs|bytes|kB|MB)\b/g) ?? []
    })
    expect(run, 'a value running into its unit').toEqual([])
  })

  test('explains a hard-fork signal on testnet @HY-07 @IN-16 @HY-19', async ({ page }) => {
    await page.goto(`/tx/${MNHF}?network=testnet`)
    await expect(page.locator('[data-payload="mnhfTx"]')).toContainText('Version bit')
  })

  test('says a transaction is not there and offers the other network @IN-05 @IN-16', async ({
    page,
  }) => {
    await page.goto(`/tx/${NO_SUCH}`)
    await expect(page.getByText('Not found on Mainnet')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Search Testnet' })).toBeVisible()
  })

  test('links a spent output to the transaction that spent it, at its input @IN-05', async ({
    page,
  }) => {
    await page.goto(`/tx/${REVOCATION}#out-0`)
    const link = page.locator('#out-0').getByRole('link', { name: /^in [0-9a-f]{4}…[0-9a-f]{4}/ })
    await expect(link).toBeVisible()
    await expect(link).toHaveAttribute(
      'href',
      '/tx/a1782604010574eeafc6c667602a6826832a6a9e3d9752b8b559a4732ea32cee#in-0',
    )
    await expectAccessible(page)
  })

  test('gives each coinbase output the state its address’s current list backs @HY-07 @IN-05', async ({
    page,
  }) => {
    await page.goto(`/tx/${COINBASE}`)
    await expect(page.locator('#out-1')).toContainText('Unspendable')
    await expect(page.locator('#out-0 [data-spend="spent"]')).toBeVisible()
    await expect(page.locator('#out-2 [data-spend="unspent"]')).toBeVisible()
    await expect(page.locator('#io [data-spend="unknown"]')).toHaveCount(0)
    await expect(page.locator('#out-0')).not.toContainText('finding where')
  })

  test('starts a mined transaction’s timeline at the step it has, with no empty Received step @HY-07', async ({
    page,
  }) => {
    await page.goto(`/tx/${PROREG}`)
    const settled = page.locator('#settlement')
    await expect(settled.locator('[data-step="mined"]')).toContainText(/Mined.*2026/)
    await expect(settled.locator('[data-step="seen"]')).toHaveCount(0)
    await expect(settled).not.toContainText('not recorded')
    await expect(settled.locator('[data-received-note]')).toContainText(
      'Mempool arrival times aren’t kept once a transaction is mined.',
    )
  })

  test('shows a step green only if it happened, in both themes @HY-07', async ({ page }) => {
    await page.goto(`/tx/${REVOCATION}`)
    const settled = page.locator('#settlement')
    await expect(settled.locator('[data-step="instantsend"]')).toContainText(
      'recorded by Hyphen; no second source has confirmed it',
    )
    const look = (name: string) =>
      settled.locator(`[data-step="${name}"]`).evaluate((el) => {
        const dot = getComputedStyle(el, '::before')
        const line = getComputedStyle(el, '::after')
        return {
          state: el.getAttribute('data-state'),
          dot: dot.backgroundColor,
          ring: dot.borderTopColor,
          line: line.backgroundColor,
        }
      })
    const instant = await look('instantsend')
    const mined = await look('mined')
    expect(instant.state).toBe('claimed')
    expect(mined.state).toBe('done')
    expect(instant.dot, 'a claim has no green dot').not.toBe(mined.dot)
    expect(instant.line, 'nor a green line').not.toBe(mined.line)
    expect(instant.ring).not.toBe(mined.dot)
  })

  test('keeps the lock Hyphen recorded on every surface of an old transaction @IN-05 @HY-07', async ({
    page,
  }) => {
    for (const txid of [REVOCATION, ASSET_LOCK, TRANSFER]) {
      await page.goto(`/tx/${txid}`)
      await expect(page.locator('#settlement [data-step="instantsend"]')).toHaveAttribute(
        'data-state',
        'claimed',
      )
      await expect(
        page.getByText(/InstantSend lock recorded by (a DAPI node and )?Hyphen/),
      ).toBeVisible()
      await expect(page.getByText('No InstantSend lock was seen')).toHaveCount(0)
    }
  })

  test('says the lock state is not known, in the neutral style, once no source reports one @IN-05 @HY-07', async ({
    page,
  }) => {
    await page.goto(`/tx/${NEVER_LOCKED}`)
    const step = page.locator('#settlement [data-step="instantsend"]')
    await expect(step).toHaveAttribute('data-state', 'unknown')
    await expect(step).toContainText('not known: nodes drop InstantSend locks')
    await expect(page.getByText('No InstantSend lock was seen')).toHaveCount(0)
    await expect(page.getByText(/InstantSend lock (recorded|reported)/)).toHaveCount(0)
    const ring = await step.evaluate((el) => getComputedStyle(el, '::before').borderTopStyle)
    expect(ring, 'not-known has its own dashed marker, not the skipped one').toBe('dashed')
    await expectAccessible(page)
  })

  test('shows the numeric code beside a revocation reason and says whose names they are @HY-07', async ({
    page,
  }) => {
    await page.goto(`/tx/${REVOCATION}`)
    const reason = page.locator('[data-payload="proUpRevTx"] [data-reason]')
    await expect(reason).toHaveText('Termination of service (reason 1)')
    await expect(page.locator('[data-payload="proUpRevTx"]')).toContainText(
      'Names follow Dash Core’s definitions',
    )
  })

  test('links a testnet output to the transaction that spent it, from Insight @IN-05 @IN-16 @HY-19', async ({
    page,
  }) => {
    await page.goto(`/tx/${TESTNET_TRANSFER}?network=testnet`)
    await expect(page.locator('#out-0 [data-spend="spent"]')).toBeVisible()
    await expect(page.locator('#out-0 a[href^="/tx/0666a44a"]')).toBeVisible()
    await expect(page.locator('#out-1 a[href^="/tx/85ff0299"]')).toBeVisible()
    await expect(page.locator('#io [data-spend="unknown"]')).toHaveCount(0)
    await expect(page.locator('#io [data-source="insight"]').first()).toBeVisible()
    await expect(page.getByText('Indexed by Insight').first()).toBeVisible()
  })

  test('has a single Core section navigation @IN-03', async ({ page }) => {
    await page.goto(`/tx/${TRANSFER}`)
    await expect(page.getByRole('heading', { level: 1, name: /Transaction/ })).toBeVisible()
    await expect(page.getByRole('navigation').filter({ hasText: 'Mempool' })).toHaveCount(1)
  })

  test('names every testnet amount in tDASH @IN-16', async ({ page }) => {
    await page.goto(`/tx/${TESTNET_TRANSFER}?network=testnet`)
    const kpis = page.locator('.rx-kpis')
    await expect(kpis).toContainText('tDASH to other addresses')
    const text = (await kpis.textContent()) ?? ''
    expect(text).not.toMatch(/(^|[^t])DASH/)
    expect((await page.locator('#io').textContent()) ?? '').not.toMatch(/(^|[^t])DASH/)
  })

  test('names the spender of a recent transaction’s outputs, and the one still unspent @IN-05', async ({
    page,
  }) => {
    await page.goto(`/tx/${TRANSFER}`)
    await expect(page.locator('#io [data-spend="spent"]')).toHaveCount(8)
    await expect(page.locator('#out-8 [data-spend="unspent"]')).toBeVisible()
    await expect(page.locator('#io [data-spend="unknown"]')).toHaveCount(0)
    await expect(
      page.locator('#out-0').getByRole('link', { name: /^in 653f…82a4/ }),
    ).toHaveAttribute(
      'href',
      '/tx/653ff05aacefc2c93e664f8cc41b3a71f5ab2a6b6f6315f8108de696182482a4#in-14',
    )
  })

  for (const [name, txid] of [
    ['an asset lock', ASSET_LOCK],
    ['a payment with nine outputs', TRANSFER],
  ] as const) {
    test(`keeps the flow's amounts and identities apart at every width: ${name} @HY-07`, async ({
      page,
    }) => {
      for (const width of [1440, 1100, 901]) {
        await page.setViewportSize({ width, height: 900 })
        await page.goto(`/tx/${txid}`)
        const svg = page.locator('#flow svg.rx-flow')
        await expect(svg).toBeVisible()
        const boxes = await svg
          .locator('text')
          .evaluateAll((els) =>
            els
              .map((e) => e.getBoundingClientRect())
              .map((r): [number, number, number, number] => [r.left, r.top, r.right, r.bottom]),
          )
        expect(boxes.length).toBeGreaterThan(3)
        for (let a = 0; a < boxes.length; a++) {
          for (let b = a + 1; b < boxes.length; b++) {
            const [al, at, ar, ab] = boxes[a]!
            const [bl, bt, br, bb] = boxes[b]!
            const overlaps = al < br - 0.5 && bl < ar - 0.5 && at < bb - 0.5 && bt < ab - 0.5
            expect(overlaps, `${width}px: label ${a} overlaps label ${b}`).toBe(false)
          }
        }
      }
      await page.setViewportSize({ width: 700, height: 900 })
      await expect(page.locator('#flow svg.rx-flow')).toBeHidden()
      await expect(page.locator('#flow .rx-flowsm')).toBeVisible()
    })
  }
})
