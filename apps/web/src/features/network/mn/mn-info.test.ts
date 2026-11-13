import { describe, expect, it } from 'vitest'
import { crawlDiffers, dapiFacts, dkgRules, dkgRuleUrl, protxToBase58 } from './mn-info'
import type { RadarMasternodeDetail } from '@/data/radar/schemas'

const PROTX = 'd353cdcae53071401345c38ab482935cb62442be2174a1d3210ca356c9017eff'

describe('ProTx base58', () => {
  it('writes the 32 bytes as the Platform identity id', () => {
    expect(protxToBase58(PROTX)).toHaveLength(44)
  })
})

describe('crawlDiffers', () => {
  const d = {
    type: 'Evo',
    status: 'enabled',
    service: '1.2.3.4:9999',
    voting_address: 'Xa',
    pubkey_operator: 'AB',
    platform_node_id: 'aa',
  } as unknown as RadarMasternodeDetail

  it('flags only the fields where DAPI disagrees with the crawl', () => {
    const f = dapiFacts({
      proRegTxHash: PROTX,
      confirmedHash: '',
      service: '1.2.3.5:9999',
      pubKeyOperator: 'ab',
      votingAddress: 'Xa',
      isValid: true,
      type: 1,
      platformNodeId: 'aa',
    })
    expect(crawlDiffers(d, f)).toEqual({
      service: true,
      type: false,
      voting: false,
      operator: false,
      nodeId: false,
      valid: false,
    })
  })
})

describe('dkgRules', () => {
  it('reads what Radar sent and falls back to the Dash Core 24 numbers', () => {
    expect(
      dkgRules({ release: 'Dash Core 25', min_protocol: 70250, core_commit: 'abc1234' }),
    ).toMatchObject({
      release: 'Dash Core 25',
      minProtocol: 70250,
      reachFailures: 3,
    })
    const rules = dkgRules(undefined)
    expect(rules.release).toBe('Dash Core 24')
    expect(dkgRuleUrl(rules)).toBe(
      'https://github.com/dashpay/dash/blob/v24.0.0/src/active/dkgsession.cpp',
    )
  })
})
