import { describe, expect, it } from 'vitest'
import { queryPresets } from './presets'
import { planQuery } from './run'
import { toDocumentsQuery } from './sql-parser'

describe('query presets', () => {
  for (const net of ['mainnet', 'testnet', 'devnet-ruby'] as const) {
    it(`parses every preset on ${net}`, () => {
      const presets = queryPresets(net)
      expect(presets.length).toBeGreaterThanOrEqual(2)
      for (const preset of presets) {
        const plan = planQuery(preset.sql, preset.contractId)
        expect(plan.ok, `${preset.id}: ${JSON.stringify(plan)}`).toBe(true)
      }
    })
  }

  it('offers aggregates only where a contract can answer them', () => {
    expect(queryPresets('mainnet').map((p) => p.id)).toEqual(['dpns-label', 'dashpay-owner'])
    expect(queryPresets('testnet').map((p) => p.id)).toEqual([
      'dpns-label',
      'dashpay-profiles',
      'sum',
      'group-by',
    ])
  })

  it('asks for what the recorded fixtures hold', () => {
    const args = (net: 'mainnet' | 'testnet') =>
      queryPresets(net).flatMap((preset) => {
        const plan = planQuery(preset.sql, preset.contractId)
        if (!plan.ok) return []
        return plan.statements.map((s) => toDocumentsQuery(s.parsed, s.contractId))
      })
    expect(args('testnet')[0]).toEqual({
      contractId: 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec',
      type: 'domain',
      where: [
        ['normalizedParentDomainName', '==', 'dash'],
        ['normalizedLabel', '==', 'therea1s11mshaddy5'],
      ],
      limit: 5,
    })
  })
})
