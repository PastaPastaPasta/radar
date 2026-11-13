import type { MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import type { ContractFullDto } from '@/data/sdk/methods'

type Json = Record<string, unknown>

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)
const asObject = (v: unknown): Json | undefined => (isObject(v) ? v : undefined)

/** The configuration the contract states for the token at `position`. */
export function tokenConfigOf(contract: ContractFullDto, position: number): Json | undefined {
  return contract.tokens.find((t) => t.position === position)?.config
}

export interface Localization {
  singular: string
  plural: string
  capitalize: boolean
}

/** The token's names by locale (`en`, `de`, …), as the contract lists them. */
export function localizationsOf(config: Json): Record<string, Localization> {
  const raw = asObject(asObject(config.conventions)?.localizations) ?? {}
  const out: Record<string, Localization> = {}
  for (const [locale, value] of Object.entries(raw)) {
    const l = asObject(value)
    if (!l || typeof l.singularForm !== 'string' || typeof l.pluralForm !== 'string') continue
    out[locale] = {
      singular: l.singularForm,
      plural: l.pluralForm,
      capitalize: l.shouldCapitalize === true,
    }
  }
  return out
}

/** The name in the UI language when the contract has it, else English, else the first one listed. */
export function pickLocalization(
  locs: Record<string, Localization>,
  locale: string,
): Localization | undefined {
  const base = locale.split('-')[0] ?? locale
  return locs[locale] ?? locs[base] ?? locs.en ?? Object.values(locs)[0]
}

export function decimalsOf(config: Json): number | undefined {
  const d = asObject(config.conventions)?.decimals
  return typeof d === 'number' && Number.isInteger(d) && d >= 0 ? d : undefined
}

/** A supply the contract states, as an integer in base units; absent or malformed is `undefined`. */
export function supplyOf(config: Json, key: 'baseSupply' | 'maxSupply'): bigint | undefined {
  const v = config[key]
  if (typeof v === 'bigint') return v
  if (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0) return BigInt(v)
  if (typeof v === 'string' && /^\d+$/.test(v)) return BigInt(v)
  return undefined
}

export type ActionTaker =
  | { kind: 'no-one' }
  | { kind: 'owner' }
  | { kind: 'main-group' }
  | { kind: 'group'; position: number }
  | { kind: 'identity'; id: string }
  | { kind: 'unknown'; type: string }

/** Who an authorization names: nobody, the contract owner, an identity, a contract group, or the main control group. */
export function takerOf(raw: unknown): ActionTaker {
  const o = asObject(raw)
  const type = typeof o?.$type === 'string' ? o.$type : ''
  switch (type) {
    case 'noOne':
      return { kind: 'no-one' }
    case 'contractOwner':
      return { kind: 'owner' }
    case 'mainGroup':
      return { kind: 'main-group' }
    case 'group': {
      const n = o?.position ?? o?.groupContractPosition ?? o?.group
      return typeof n === 'number' ? { kind: 'group', position: n } : { kind: 'unknown', type }
    }
    case 'identity': {
      const id = o?.identity ?? o?.id
      return typeof id === 'string' ? { kind: 'identity', id } : { kind: 'unknown', type }
    }
    default:
      return { kind: 'unknown', type }
  }
}

export interface RuleRow {
  key: string
  label: MessageDescriptor
  /** Who may make the change the rule governs. */
  authorized: ActionTaker
  /** Who may change the rule itself. */
  admin: ActionTaker
}

interface RuleSpec {
  key: string
  label: MessageDescriptor
  path: readonly string[]
}

const RULES: readonly RuleSpec[] = [
  { key: 'mint', label: msg`Mint`, path: ['manualMintingRules'] },
  { key: 'burn', label: msg`Burn`, path: ['manualBurningRules'] },
  { key: 'freeze', label: msg`Freeze a balance`, path: ['freezeRules'] },
  { key: 'unfreeze', label: msg`Unfreeze a balance`, path: ['unfreezeRules'] },
  { key: 'destroy', label: msg`Destroy frozen funds`, path: ['destroyFrozenFundsRules'] },
  { key: 'pause', label: msg`Pause and resume`, path: ['emergencyActionRules'] },
  {
    key: 'price',
    label: msg`Change the direct purchase price`,
    path: ['distributionRules', 'changeDirectPurchasePricingRules'],
  },
  { key: 'max-supply', label: msg`Change the maximum supply`, path: ['maxSupplyChangeRules'] },
  { key: 'conventions', label: msg`Change names and decimals`, path: ['conventionsChangeRules'] },
  {
    key: 'trade-mode',
    label: msg`Change the trade mode`,
    path: ['marketplaceRules', 'tradeModeChangeRules'],
  },
  {
    key: 'perpetual',
    label: msg`Change the perpetual distribution`,
    path: ['distributionRules', 'perpetualDistributionRules'],
  },
  {
    key: 'destination',
    label: msg`Change where new tokens go`,
    path: ['distributionRules', 'newTokensDestinationIdentityRules'],
  },
  {
    key: 'choose-destination',
    label: msg`Change whether minting may choose a recipient`,
    path: ['distributionRules', 'mintingAllowChoosingDestinationRules'],
  },
]

function at(config: Json, path: readonly string[]): Json | undefined {
  let node: unknown = config
  for (const key of path) node = asObject(node)?.[key]
  return asObject(node)
}

/** The change rules the configuration states, each with who holds it; a rule the contract omits is left out. */
export function rulesOf(config: Json): RuleRow[] {
  return RULES.flatMap((spec) => {
    const rule = at(config, spec.path)
    if (!rule) return []
    return [
      {
        key: spec.key,
        label: spec.label,
        authorized: takerOf(rule.authorizedToMakeChange),
        admin: takerOf(rule.adminActionTakers),
      },
    ]
  })
}

export interface DistributionView {
  /** The configured perpetual distribution, as the contract states it, or `undefined`. */
  perpetual: Json | undefined
  /** A short name for its schedule kind (`BlockBasedDistribution`, `TimeBasedDistribution`, …). */
  perpetualKind: string | undefined
  /** The configured pre-programmed distribution, or `undefined`. */
  preProgrammed: Json | undefined
  /** How many dated releases the pre-programmed distribution lists. */
  preProgrammedMoments: number | undefined
  destination: string | undefined
  mintingChoosesRecipient: boolean
}

function kindOf(perpetual: Json): string | undefined {
  const type = asObject(perpetual.distributionType) ?? asObject(perpetual.distribution_type)
  if (!type) return undefined
  const named = typeof type.$type === 'string' ? type.$type : undefined
  return named ?? Object.keys(type).find((k) => !k.startsWith('$'))
}

export function distributionOf(config: Json): DistributionView {
  const rules = asObject(config.distributionRules) ?? {}
  const perpetual = asObject(rules.perpetualDistribution)
  const pre = asObject(rules.preProgrammedDistribution)
  const moments = pre ? asObject(pre.distributions) : undefined
  return {
    perpetual,
    perpetualKind: perpetual ? kindOf(perpetual) : undefined,
    preProgrammed: pre,
    preProgrammedMoments: moments ? Object.keys(moments).length : undefined,
    destination:
      typeof rules.newTokensDestinationIdentity === 'string'
        ? rules.newTokensDestinationIdentity
        : undefined,
    mintingChoosesRecipient: rules.mintingAllowChoosingDestination === true,
  }
}

export interface FlagView {
  startsPaused: boolean
  allowsTransferToFrozen: boolean
  keepsHistory: { key: keyof typeof HISTORY_LABELS; on: boolean }[]
}

const HISTORY_KEYS = [
  'keepsTransferHistory',
  'keepsFreezingHistory',
  'keepsMintingHistory',
  'keepsBurningHistory',
  'keepsDirectPricingHistory',
  'keepsDirectPurchaseHistory',
] as const

export const HISTORY_LABELS: Record<(typeof HISTORY_KEYS)[number], MessageDescriptor> = {
  keepsTransferHistory: msg`Transfers`,
  keepsFreezingHistory: msg`Freezing`,
  keepsMintingHistory: msg`Minting`,
  keepsBurningHistory: msg`Burning`,
  keepsDirectPricingHistory: msg`Price changes`,
  keepsDirectPurchaseHistory: msg`Direct purchases`,
}

export function flagsOf(config: Json): FlagView {
  const history = asObject(config.keepsHistory) ?? {}
  return {
    startsPaused: config.startAsPaused === true,
    allowsTransferToFrozen: config.allowTransferToFrozenBalance === true,
    keepsHistory: HISTORY_KEYS.map((key) => ({ key, on: history[key] === true })),
  }
}

export const mainControlGroupOf = (config: Json): number | undefined =>
  typeof config.mainControlGroup === 'number' ? config.mainControlGroup : undefined

export const descriptionOf = (config: Json): string | undefined =>
  typeof config.description === 'string' && config.description !== ''
    ? config.description
    : undefined
