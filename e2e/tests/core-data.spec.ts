import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect as plainExpect, test as plain } from '@playwright/test'
import { expect, test } from '../helpers/test'

const DAPI = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'apps/web/src/test/fixtures/dapi',
)

interface Answer<T> {
  data: T
  source: string
  proved: boolean
}

interface Core {
  tip(net: string): Promise<Answer<{ height: number; hash: string; time: number }>>
  block(
    net: string,
    ref: { height: number },
  ): Promise<Answer<{ height: number; txs: { payload?: { kind: string } }[] } | null>>
  tx(
    net: string,
    txid: string,
  ): Promise<Answer<{ type: string; payload?: { kind: string } } | null>>
}

interface Manifest {
  tip: { height: number; hash: string }
  entries: { id: string; txid?: string; height?: number }[]
}

const manifest = (net: string) =>
  JSON.parse(readFileSync(path.join(DAPI, net, 'manifest.json'), 'utf8')) as Manifest

for (const net of ['mainnet', 'testnet'] as const) {
  test.describe(`Core data on ${net}`, () => {
    test('the Core façade answers from the DAPI recording', async ({ page }) => {
      const m = manifest(net)
      const tx = m.entries.find((e) => e.id === 'tx-assetlock')!
      await page.goto('/status')
      await page.getByRole('heading', { level: 1 }).waitFor()

      const got = await page.evaluate(
        async ({ net, txid, height }) => {
          const core = (window as unknown as { __radarCore: Core }).__radarCore
          const tip = await core.tip(net)
          const block = await core.block(net, { height })
          const found = await core.tx(net, txid)
          return {
            tip: { ...tip.data, source: tip.source, proved: tip.proved },
            blockHeight: block.data?.height,
            blockCoinbase: block.data?.txs[0]?.payload?.kind,
            txType: found.data?.type,
            txPayload: found.data?.payload?.kind,
            txSource: found.source,
          }
        },
        { net, txid: tx.txid!, height: m.tip.height },
      )

      expect(got.tip).toMatchObject({
        height: m.tip.height,
        hash: m.tip.hash,
        source: 'dapi',
        proved: false,
      })
      expect(got.blockHeight).toBe(m.tip.height)
      expect(got.blockCoinbase).toBe('cbTx')
      expect(got.txType).toBe('asset-lock')
      expect(got.txPayload).toBe('assetLockTx')
      expect(got.txSource).toBe('dapi')
    })
  })
}

for (const net of ['mainnet', 'testnet'] as const) {
  plain(`an unrecorded ${net} DAPI request fails loudly`, async ({ page }) => {
    const errors: string[] = []
    page.on('console', (m) => {
      if (m.type() === 'error' && m.text().startsWith('[radar-fixtures]')) errors.push(m.text())
    })
    await page.goto('/status')
    await page.getByRole('heading', { level: 1 }).waitFor()
    const kind = await page.evaluate(async (net) => {
      const core = (window as unknown as { __radarCore: Core }).__radarCore
      try {
        await core.block(net, { height: 7 })
        return 'answered'
      } catch (e) {
        return (e as { kind?: string }).kind
      }
    }, net)
    plainExpect(kind).toBe('network')
    plainExpect(errors).toHaveLength(1)
    plainExpect(errors[0]).toContain('getBlock')
  })
}
