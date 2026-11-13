import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createMasternodeList } from '@/data/core/mn-list'
import { joinMnRows } from '@/data/masternodes/rows'
import { RadarMasternodesSchema } from '@/data/radar/schemas'
import type { NetworkId } from '@/lib/network'
import { FixtureDapiTransport } from '@/test/msw/dapi-transport'

async function load(net: NetworkId) {
  const recorded = JSON.parse(
    readFileSync(resolve(__dirname, `../../fixtures/http/radar/${net}/masternodes.json`), 'utf8'),
  ) as { body: unknown }
  const body = recorded.body
  const crawl = RadarMasternodesSchema.parse(body)
  const { masternodeList } = createMasternodeList({
    transport: () => new FixtureDapiTransport(),
    headers: () => Promise.resolve({ data: [] }) as never,
    now: Date.now,
  })
  const list = await masternodeList(net)
  const sourced = {
    source: 'radar' as const,
    asOf: 1,
    fetchedAt: 1,
    proved: false,
    data: crawl.masternodes,
  }
  return { crawl, list, joined: joinMnRows(sourced, list)! }
}

const SHAPE = {
  mainnet: { rows: 2990, crawled: 150, differs: 6 },
  testnet: { rows: 401, crawled: 150, differs: 0 },
} as const

describe.each(['mainnet', 'testnet'] as const)('the recorded %s lists, joined', (net) => {
  it('makes DAPI’s masternodes the rows and attaches the crawl to those it knows', async () => {
    const { joined } = await load(net)
    const rows = joined.data.rows
    expect(rows).toHaveLength(SHAPE[net].rows)
    expect(rows.filter((r) => r.crawl)).toHaveLength(SHAPE[net].crawled)
    expect(rows.every((r) => r.dapi !== null && r.registration !== null)).toBe(true)
    expect(joined.data.dapi?.source).toBe('dapi')
    expect(joined.data.radar?.source).toBe('radar')
    expect(new Set(rows.map((r) => r.protx)).size).toBe(rows.length)
  })

  it('gives every evonode its Platform node ID', async () => {
    const { joined } = await load(net)
    const evo = joined.data.rows.filter((r) => r.type === 'evo')
    expect(evo.length).toBeGreaterThan(50)
    expect(evo.every((r) => /^[0-9a-f]{40}$/.test(r.registration?.platformNodeId ?? ''))).toBe(true)
  })

  it('marks the rows whose crawl disagrees, and lets DAPI win on what they disagree about', async () => {
    const { joined } = await load(net)
    const differing = joined.data.rows.filter((r) => r.crawlDiffers)
    expect(differing).toHaveLength(SHAPE[net].differs)
    for (const r of differing) {
      expect(r.crawl).not.toBeNull()
      const crawledType = r.crawl!.type === 'Evo' ? 'evo' : 'regular'
      const crawledStatus = r.crawl!.status === 'enabled' ? 'enabled' : 'pose-banned'
      const dapiSays = r.registration && { type: r.type, status: r.status }
      expect(
        crawledType !== dapiSays?.type ||
          crawledStatus !== dapiSays.status ||
          r.crawl!.service !== r.service,
      ).toBe(true)
    }
  })
})

describe('the mainnet row whose PoSe status DAPI and the crawl disagree on', () => {
  it('shows DAPI’s status', async () => {
    const { joined } = await load('mainnet')
    const row = joined.data.rows.find(
      (r) => r.protx === '3e596421618da23ec6700771c2f4cf819fd9ddec753f7889c96f7d1ecb6f9c40',
    )
    expect(row).toMatchObject({ status: 'enabled', type: 'evo', crawlDiffers: true })
    expect(row?.crawl?.status).toBe('pose_banned')
  })
})
