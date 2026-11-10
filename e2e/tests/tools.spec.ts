import type { Page } from '@playwright/test'
import { expectAccessible } from '../helpers/a11y'
import { expect, test } from '../helpers/test'

const ADDRESS = 'XnT33zjrFKjt3ymfyQZs2FPiKNer3WVj14'
const SIGNER = 'XeFwrdaCNwNL2JhfafKgBnWBJi7VRUeD4W'
const TESTNET_SIGNER = 'yPtYsaedpV2QN3dD9We5DovXazbrttLX1L'
const MESSAGE = 'Radar verify message vector'
const SIGNATURE =
  'H4nT5ZL9Z/NhXrrDt/ro/0LRwrGK53LsoK4mSrcdIBM/V5Fb9A/MshzODOde8hzEv0ig2OnQEwzrB7VMRuIyaHU='
const PHRASE =
  'abandon ability able about above absent absorb abstract absurd abuse access accident'

test.describe('verify message', () => {
  async function fill(page: Page, fields: { address: string; message: string; signature: string }) {
    await page.getByLabel('Address').fill(fields.address)
    await page.getByLabel('Message').fill(fields.message)
    await page.getByLabel('Signature').fill(fields.signature)
  }

  test('a signature the address made is valid, and nothing typed leaves the page @IN-08', async ({
    page,
  }) => {
    await page.goto('/tools/verify-message')
    await expect(page.getByRole('heading', { level: 1, name: 'Verify message' })).toBeVisible()
    await fill(page, { address: SIGNER, message: MESSAGE, signature: SIGNATURE })
    const sent: string[] = []
    page.on('request', (r) => sent.push(`${r.url()} ${r.postData() ?? ''}`))
    await page.getByRole('button', { name: 'Verify' }).click()
    await expect(page.getByText('This address signed this message.')).toBeVisible()
    await expect(page.locator('[data-result="valid"]')).toBeVisible()
    const leaked = sent.filter((r) =>
      [SIGNER, MESSAGE, SIGNATURE].some((secret) =>
        [secret, encodeURIComponent(secret), secret.replaceAll(' ', '+')].some((form) =>
          r.includes(form),
        ),
      ),
    )
    expect(leaked, 'requests carrying what was typed').toEqual([])
    expect(page.url()).not.toContain(SIGNER)
    await expectAccessible(page)
  })

  test('a changed message is invalid and says who signed @IN-08', async ({ page }) => {
    await page.goto('/tools/verify-message')
    await fill(page, { address: SIGNER, message: `${MESSAGE}!`, signature: SIGNATURE })
    await page.getByRole('button', { name: 'Verify' }).click()
    await expect(page.getByText('This address did not sign this message.')).toBeVisible()
    await expect(page.locator('[data-result="invalid"]')).toBeVisible()
  })

  test('a malformed signature is "can’t check", not "invalid" @IN-08', async ({ page }) => {
    await page.goto('/tools/verify-message')
    await fill(page, { address: SIGNER, message: MESSAGE, signature: 'not a signature' })
    await page.getByRole('button', { name: 'Verify' }).click()
    await expect(page.getByText('That isn’t a Dash signature.')).toBeVisible()
    await expect(page.locator('[data-result="error"]')).toBeVisible()
  })

  test('a recovery phrase is refused and never leaves the page @IN-08', async ({ page }) => {
    await page.goto('/tools/verify-message')
    await fill(page, { address: SIGNER, message: PHRASE, signature: SIGNATURE })
    await expect(page.getByRole('alert')).toContainText('private key or a recovery phrase')
    await expect(page.getByRole('button', { name: 'Verify' })).toBeDisabled()
  })

  test('clearing removes the fields and the result @IN-08', async ({ page }) => {
    await page.goto('/tools/verify-message')
    await fill(page, { address: SIGNER, message: MESSAGE, signature: SIGNATURE })
    await page.getByRole('button', { name: 'Verify' }).click()
    await expect(page.locator('[data-result="valid"]')).toBeVisible()
    await page.getByRole('button', { name: 'Clear' }).click()
    await expect(page.locator('[data-result]')).toHaveCount(0)
    await expect(page.getByLabel('Address')).toHaveValue('')
  })

  test('works on testnet and offers the switch for the other network @IN-16 @HY-19', async ({
    page,
  }) => {
    await page.goto('/tools/verify-message?network=testnet')
    await expect(page.locator('[data-testnet-keyline="test"]')).toBeAttached()
    await fill(page, { address: TESTNET_SIGNER, message: MESSAGE, signature: SIGNATURE })
    await page.getByRole('button', { name: 'Verify' }).click()
    await expect(page.getByText('This address signed this message.')).toBeVisible()

    await page.goto('/tools/verify-message')
    await fill(page, { address: TESTNET_SIGNER, message: MESSAGE, signature: SIGNATURE })
    await page.getByRole('button', { name: 'Verify' }).click()
    await expect(page.getByRole('link', { name: 'Switch to testnet' })).toHaveAttribute(
      'href',
      /network=testnet/,
    )
  })
})

test.describe('QR reader', () => {
  test('reads an address from a picture and searches it, using the real decoder @IN-11', async ({
    page,
  }) => {
    await page.goto(`/address/${ADDRESS}`)
    const qr = page.getByRole('img', { name: /QR code of the address/ })
    await expect(qr).toBeVisible()
    const png = await qr.evaluate(async (img: HTMLImageElement) => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      canvas.getContext('2d')!.drawImage(img, 0, 0)
      const blob = await new Promise<Blob | null>((done) => {
        canvas.toBlob(done, 'image/png')
      })
      return Array.from(new Uint8Array(await blob!.arrayBuffer()))
    })

    await page.goto('/tools/qr')
    await expect(page.getByRole('heading', { level: 1, name: 'QR reader' })).toBeVisible()
    await page.getByLabel('Choose a picture with a QR code').setInputFiles({
      name: 'address.png',
      mimeType: 'image/png',
      buffer: Buffer.from(png),
    })
    await expect(page).toHaveURL(/\/search\?q=/)
    await expect(page.getByRole('searchbox')).toHaveValue(ADDRESS)
  })

  test('says when the picture has no QR code @IN-11', async ({ page }) => {
    await page.goto('/tools/qr')
    const blank = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
      'base64',
    )
    await page.getByLabel('Choose a picture with a QR code').setInputFiles({
      name: 'blank.png',
      mimeType: 'image/png',
      buffer: blank,
    })
    await expect(page.getByText('No QR code found in that picture.')).toBeVisible()
  })

  test('falls back to the picture when the camera is refused @IN-11', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
          getUserMedia: () => Promise.reject(new DOMException('denied', 'NotAllowedError')),
        },
      })
    })
    await page.goto('/tools/qr')
    await page.getByRole('button', { name: 'Use the camera' }).click()
    await expect(page.getByText(/The browser didn’t give Radar the camera/)).toBeVisible()
    await expect(page.getByLabel('Choose a picture with a QR code')).toBeVisible()
    await expectAccessible(page)
  })

  test('works on testnet and on a phone without side scroll @IN-16 @HY-18', async ({ page }) => {
    await page.goto('/tools/qr?network=testnet')
    await expect(page.getByRole('heading', { level: 1, name: 'QR reader' })).toBeVisible()
    await expect(page.locator('[data-testnet-keyline="test"]')).toBeAttached()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(1)
  })
})
