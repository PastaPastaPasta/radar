import { describe, expect, it } from 'vitest'
import type { ContractFullDto } from '@/data/sdk/methods'
import {
  decimalsOf,
  distributionOf,
  flagsOf,
  localizationsOf,
  pickLocalization,
  rulesOf,
  supplyOf,
  takerOf,
  tokenConfigOf,
} from './token-config'

const rule = (authorized: unknown, admin: unknown = { $type: 'noOne' }) => ({
  authorizedToMakeChange: authorized,
  adminActionTakers: admin,
})

const CONFIG = {
  conventions: {
    decimals: 8,
    localizations: {
      en: { singularForm: 'coin', pluralForm: 'coins', shouldCapitalize: false },
      de: { singularForm: 'Münze', pluralForm: 'Münzen', shouldCapitalize: true },
    },
  },
  baseSupply: 100,
  maxSupply: '2100',
  startAsPaused: true,
  keepsHistory: { keepsTransferHistory: true, keepsMintingHistory: false },
  manualMintingRules: rule({ $type: 'contractOwner' }),
  manualBurningRules: rule({ $type: 'identity', identity: 'ID1' }, { $type: 'group', position: 2 }),
  freezeRules: rule({ $type: 'mainGroup' }),
  emergencyActionRules: rule({ $type: 'surprise' }),
  distributionRules: {
    perpetualDistribution: { distributionType: { BlockBasedDistribution: { interval: 100 } } },
    preProgrammedDistribution: { distributions: { '1000': {}, '2000': {} } },
    newTokensDestinationIdentity: 'DEST',
    mintingAllowChoosingDestination: true,
    changeDirectPurchasePricingRules: rule({ $type: 'noOne' }),
  },
  marketplaceRules: { tradeModeChangeRules: rule({ $type: 'noOne' }) },
  mainControlGroup: 3,
  description: 'A coin',
}

describe('takerOf', () => {
  it('names who an authorization allows', () => {
    expect(takerOf({ $type: 'noOne' })).toEqual({ kind: 'no-one' })
    expect(takerOf({ $type: 'contractOwner' })).toEqual({ kind: 'owner' })
    expect(takerOf({ $type: 'mainGroup' })).toEqual({ kind: 'main-group' })
    expect(takerOf({ $type: 'group', position: 4 })).toEqual({ kind: 'group', position: 4 })
    expect(takerOf({ $type: 'identity', identity: 'X' })).toEqual({ kind: 'identity', id: 'X' })
  })

  it('keeps what it does not know, and survives a malformed value', () => {
    expect(takerOf({ $type: 'surprise' })).toEqual({ kind: 'unknown', type: 'surprise' })
    expect(takerOf({ $type: 'group' })).toEqual({ kind: 'unknown', type: 'group' })
    expect(takerOf(null)).toEqual({ kind: 'unknown', type: '' })
  })
})

describe('rulesOf', () => {
  const rows = rulesOf(CONFIG)
  const by = (key: string) => rows.find((r) => r.key === key)

  it('lists each rule the configuration states, with who holds it and who may change it', () => {
    expect(by('mint')?.authorized).toEqual({ kind: 'owner' })
    expect(by('burn')).toMatchObject({
      authorized: { kind: 'identity', id: 'ID1' },
      admin: { kind: 'group', position: 2 },
    })
    expect(by('price')?.authorized).toEqual({ kind: 'no-one' })
    expect(by('trade-mode')?.authorized).toEqual({ kind: 'no-one' })
  })

  it('leaves out a rule the contract omits', () => {
    expect(by('unfreeze')).toBeUndefined()
    expect(rulesOf({})).toEqual([])
  })
})

describe('configuration facts', () => {
  it('reads decimals, supplies and flags, tolerating odd types', () => {
    expect(decimalsOf(CONFIG)).toBe(8)
    expect(decimalsOf({ conventions: { decimals: -1 } })).toBeUndefined()
    expect(supplyOf(CONFIG, 'baseSupply')).toBe(100n)
    expect(supplyOf(CONFIG, 'maxSupply')).toBe(2100n)
    expect(supplyOf({}, 'maxSupply')).toBeUndefined()
    expect(flagsOf(CONFIG).startsPaused).toBe(true)
    expect(flagsOf(CONFIG).keepsHistory.find((h) => h.key === 'keepsTransferHistory')?.on).toBe(
      true,
    )
    expect(flagsOf(CONFIG).keepsHistory.find((h) => h.key === 'keepsMintingHistory')?.on).toBe(
      false,
    )
  })

  it('finds the configuration at a position of a contract', () => {
    const contract = {
      tokens: [
        { position: 0, config: { a: 1 } },
        { position: 2, config: CONFIG },
      ],
    }
    expect(tokenConfigOf(contract as unknown as ContractFullDto, 2)).toBe(CONFIG)
    expect(tokenConfigOf(contract as unknown as ContractFullDto, 1)).toBeUndefined()
  })
})

describe('names', () => {
  const locs = localizationsOf(CONFIG)

  it('picks the UI language, then its base language, then English', () => {
    expect(pickLocalization(locs, 'de')?.singular).toBe('Münze')
    expect(pickLocalization(locs, 'de-AT')?.plural).toBe('Münzen')
    expect(pickLocalization(locs, 'ja')?.singular).toBe('coin')
    expect(pickLocalization({}, 'en')).toBeUndefined()
  })

  it('ignores a localisation that lacks its forms', () => {
    expect(
      localizationsOf({ conventions: { localizations: { en: { singularForm: 'x' } } } }),
    ).toEqual({})
  })
})

describe('distributionOf', () => {
  it('describes a perpetual and a pre-programmed distribution', () => {
    const d = distributionOf(CONFIG)
    expect(d.perpetualKind).toBe('BlockBasedDistribution')
    expect(d.preProgrammedMoments).toBe(2)
    expect(d.destination).toBe('DEST')
    expect(d.mintingChoosesRecipient).toBe(true)
  })

  it('reports none for a token that has no distribution', () => {
    const d = distributionOf({ distributionRules: { perpetualDistribution: null } })
    expect(d.perpetual).toBeUndefined()
    expect(d.preProgrammed).toBeUndefined()
    expect(d.mintingChoosesRecipient).toBe(false)
  })
})
