import { expect as baseExpect, test } from '../helpers/test'

const expect = baseExpect.configure({ timeout: 20_000 })

const TRANSFER = '8acce06e01135b73f1acc26c8cb1084917e9bcf4a83ef1d1068df96a7c427a90'
const ADDRESS = 'XfsmNmxweSA2a7oNRyJk8UX5NM7htXdG55'

test.describe('one failed source never blanks a page @X-09', () => {
  test('a transaction renders from Hyphen when the DAPI nodes do not answer', async ({ page }) => {
    await page.addInitScript(() => sessionStorage.setItem('radar.fixture.down', '["dapi"]'))
    await page.goto(`/tx/${TRANSFER}`)
    await expect(page.getByRole('heading', { level: 1, name: /Transaction/ })).toBeVisible()
    await expect(page.locator('#in-0')).toBeVisible()
    await expect(page.locator('#out-0')).toBeVisible()
    await expect(page.getByText('This page couldn’t be shown')).toHaveCount(0)
    await expect(
      page.locator('[data-source="hyphen"][data-fallback="dapi-down"]').first(),
    ).toBeVisible()
  })

  test('an address renders from Insight when Hyphen does not answer', async ({ page }) => {
    await page.addInitScript(() => sessionStorage.setItem('radar.fixture.down', '["hyphen"]'))
    await page.goto(`/address/${ADDRESS}`)
    const summary = page.locator('[data-address-summary]')
    await expect(summary).toContainText('Balance')
    await expect(page.getByRole('table', { name: /Transactions/ })).toBeVisible()
    await expect(page.locator('[data-source="insight"]').first()).toBeVisible()
    await expect(page.getByText('This page couldn’t be shown')).toHaveCount(0)
  })

  test('Decentralized only mode makes no hosted read when DAPI is down', async ({ page }) => {
    const hosted: string[] = []
    page.on('request', (r) => {
      if (/\/x\/hy\/|insight\.|\/x\/radar\/|platform-explorer/.test(r.url())) hosted.push(r.url())
    })
    await page.addInitScript(() => sessionStorage.setItem('radar.fixture.down', '["dapi"]'))
    await page.goto(`/tx/${TRANSFER}?sources=decentralized`)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(
      page.locator('[data-source-mode="decentralized"]').locator('visible=true').first(),
    ).toBeVisible()
    await expect(page.locator('#in-0')).toHaveCount(0)
    expect(hosted).toEqual([])
  })
})
