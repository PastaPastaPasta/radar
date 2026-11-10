import { expect as plainExpect, test as plain } from '@playwright/test'
import { expect, test } from '../helpers/test'

interface Proved<T> {
  data: T
  source: string
  proved: boolean
  height?: number
  asOf: number
  fetchedAt: number
  proof?: { chainId: string; platformHeight: number; epoch: number; proofBytes: number; id: string }
}

interface Sdk {
  state(net: string): string
  call(net: string, method: string, args: unknown): Promise<Proved<unknown>>
}

for (const net of ['mainnet', 'testnet'] as const) {
  test.describe(`SDK data on ${net}`, () => {
    test('Platform height and epoch come proof-checked from the SDK fixtures', async ({ page }) => {
      await page.goto('/status')
      await page.getByRole('heading', { level: 1 }).waitFor()
      const got = await page.evaluate(async (net) => {
        const sdk = (window as unknown as { __radarSdk: Sdk }).__radarSdk
        const r = await sdk.call(net, 'epoch.current', {})
        return { after: sdk.state(net), r }
      }, net)
      expect(got.after).toBe('ready')
      expect(got.r).toMatchObject({ source: 'sdk', proved: true })
      expect(got.r.height).toBe(got.r.proof?.platformHeight)
      expect(got.r.proof?.chainId).toBe(net === 'mainnet' ? 'evo1' : 'dash-testnet-51')
      expect(got.r.proof?.proofBytes).toBeGreaterThan(0)
      expect(got.r.asOf).toBeLessThan(got.r.fetchedAt)
    })

    test('a status answer is not called proof-checked', async ({ page }) => {
      await page.goto('/status')
      await page.getByRole('heading', { level: 1 }).waitFor()
      const r = await page.evaluate(
        (net) =>
          (window as unknown as { __radarSdk: Sdk }).__radarSdk.call(net, 'system.status', {}),
        net,
      )
      expect(r).toMatchObject({ source: 'sdk', proved: false })
      expect(r.proof).toBeUndefined()
    })
  })
}

plain('an unrecorded SDK call fails loudly', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error' && m.text().startsWith('[radar-fixtures]')) errors.push(m.text())
  })
  await page.goto('/status')
  await page.getByRole('heading', { level: 1 }).waitFor()
  const kind = await page.evaluate(async () => {
    try {
      await (window as unknown as { __radarSdk: Sdk }).__radarSdk.call(
        'mainnet',
        'identities.fetch',
        { id: 'nobody' },
      )
      return 'answered'
    } catch (e) {
      return (e as { kind?: string }).kind
    }
  })
  plainExpect(kind).toBe('network')
  plainExpect(errors).toHaveLength(1)
  plainExpect(errors[0]).toContain('identities.fetch')
})
