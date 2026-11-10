import { expectAccessible } from '../helpers/a11y'
import { expect as baseExpect, test } from '../helpers/test'

const expect = baseExpect.configure({ timeout: 15_000 })

const TRANSFER = '8acce06e01135b73f1acc26c8cb1084917e9bcf4a83ef1d1068df96a7c427a90'
const NO_SUCH = '0000000000000000000000000000000000000000000000000000000000000001'
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
})
