import type { DataClass } from '@/lib/data-class'

/** What a token costs to buy directly from its owner, in credits (a pricing schedule's current price). */
export interface TokenPriceDto {
  basePrice: bigint
  currentPrice: bigint
}

/** The moment of an identity's last perpetual-distribution claim: a block height, a time or an epoch. */
export type RewardMomentDto =
  | { type: 'block'; blockHeight: bigint }
  | { type: 'time'; timestampMs: bigint }
  | { type: 'epoch'; epochIndex: number }

/** SDK methods only this package calls: add entries here, never in a shared file. */
export interface PTokenMethods {
  /** A token with no direct-purchase price has no price: its entry is `null`. */
  'tokens.directPurchasePrices': {
    args: { tokenIds: string[] }
    result: Map<string, TokenPriceDto | null>
  }
  /** `null` when the identity has never claimed from the token. */
  'tokens.perpetualDistributionLastClaim': {
    args: { identityId: string; tokenId: string }
    result: RewardMomentDto | null
  }
  /** The identity a DPNS name points to, or `null` for a name nobody holds. The SDK has no proof for it. */
  'dpns.resolveName': {
    args: { name: string }
    result: string | null
  }
}

export const P_TOKEN_CLASSES = {
  'tokens.directPurchasePrices': 'live',
  'tokens.perpetualDistributionLastClaim': 'live',
  'dpns.resolveName': 'structural',
} as const satisfies Record<keyof PTokenMethods, DataClass>
