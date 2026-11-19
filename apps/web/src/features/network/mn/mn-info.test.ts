import { describe, expect, it } from 'vitest'
import {
  crawlDiffers,
  dapiFacts,
  departureOf,
  dkgRules,
  dkgRuleUrl,
  operatorRewardText,
  protxToBase58,
} from './mn-info'
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

describe('operatorRewardText', () => {
  it('reads Radar’s operator_reward as a percentage, as Dash Core’s protx info gives it', () => {
    expect(operatorRewardText(8)).toBe('8%')
    expect(operatorRewardText(15)).toBe('15%')
    expect(operatorRewardText(0.5)).toBe('0.5%')
    expect(operatorRewardText(12.34)).toBe('12.34%')
  })
})

describe('departureOf', () => {
  const removed = {
    removed: 1_795_024_928,
    changes: [
      { field: 'service', height: 2_500_000, ts: 1_790_000_000_000, old: 'a', new: 'b' },
      {
        field: 'removed',
        height: 2_574_457,
        ts: 1_795_024_928_000,
        old: '85.209.241.49:9999',
        new: null,
      },
    ],
  } as unknown as Pick<RadarMasternodeDetail, 'removed' | 'changes'>

  it('says when and where a masternode left the list', () => {
    expect(departureOf(removed, null, true)).toEqual({
      height: 2_574_457,
      at: 1_795_024_928_000,
      service: '85.209.241.49:9999',
      confirmed: true,
    })
  })

  it('leaves it Radar’s claim, not a fact, while DAPI’s list has not answered', () => {
    expect(departureOf(removed, null, false)).toMatchObject({ height: 2_574_457, confirmed: false })
  })

  it('takes the record’s own time when no change says when', () => {
    const bare = { removed: 1_795_024_928, changes: [] } as unknown as Pick<
      RadarMasternodeDetail,
      'removed' | 'changes'
    >
    expect(departureOf(bare, null, true)).toEqual({
      height: null,
      at: 1_795_024_928_000,
      service: null,
      confirmed: true,
    })
  })

  it('is null while the masternode is listed, by Radar or by DAPI', () => {
    const listed = { removed: null, changes: [] } as unknown as Pick<
      RadarMasternodeDetail,
      'removed' | 'changes'
    >
    expect(departureOf(listed, null, true)).toBeNull()
    expect(departureOf(null, null, true)).toBeNull()
    const f = dapiFacts({
      proRegTxHash: PROTX,
      confirmedHash: '',
      service: '1.2.3.4:9999',
      pubKeyOperator: 'ab',
      votingAddress: 'Xa',
      isValid: true,
      type: 0,
    })
    expect(departureOf(removed, f, true)).toBeNull()
  })
})
