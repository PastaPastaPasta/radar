import type { PTokenMethods } from '../../methods'
import type { Freeable, ImplOf, ProvedResponse } from './types'

interface PriceLike extends Freeable {
  basePrice: string
  currentPrice: string
}

interface RewardMomentLike extends Freeable {
  type: string
  blockHeight?: bigint
  epochIndex?: number
  timestampMs?: bigint
}

/** The part of `EvoSDK` this package's methods read. */
export interface PTokenReads {
  tokens: {
    directPurchasePricesWithProof(
      tokenIds: string[],
    ): Promise<ProvedResponse<Map<string, PriceLike | undefined>>>
    perpetualDistributionLastClaimWithProof(
      identityId: string,
      tokenId: string,
    ): Promise<ProvedResponse<RewardMomentLike | null | undefined>>
  }
  dpns: {
    resolveName(name: string): Promise<string | undefined>
  }
}

type Impl<M extends keyof PTokenMethods> = ImplOf<PTokenReads, M>
type TokenPriceDto = NonNullable<
  PTokenMethods['tokens.directPurchasePrices']['result'] extends Map<string, infer V> ? V : never
>
type RewardMomentDto = NonNullable<PTokenMethods['tokens.perpetualDistributionLastClaim']['result']>

function priceDto(price: PriceLike): TokenPriceDto {
  return { basePrice: BigInt(price.basePrice), currentPrice: BigInt(price.currentPrice) }
}

function momentDto(moment: RewardMomentLike): RewardMomentDto | null {
  if (moment.type === 'block' && moment.blockHeight !== undefined) {
    return { type: 'block', blockHeight: moment.blockHeight }
  }
  if (moment.type === 'time' && moment.timestampMs !== undefined) {
    return { type: 'time', timestampMs: moment.timestampMs }
  }
  if (moment.type === 'epoch' && moment.epochIndex !== undefined) {
    return { type: 'epoch', epochIndex: moment.epochIndex }
  }
  return null
}

export const pTokenImpl: { [M in keyof PTokenMethods]: Impl<M> } = {
  async 'tokens.directPurchasePrices'(sdk, { tokenIds }) {
    const response = await sdk.tokens.directPurchasePricesWithProof(tokenIds)
    const data = new Map<string, TokenPriceDto | null>(tokenIds.map((id) => [id, null]))
    for (const [id, price] of response.data) {
      if (price === undefined) continue
      data.set(id, priceDto(price))
      price.free?.()
    }
    return { data, response }
  },

  async 'tokens.perpetualDistributionLastClaim'(sdk, { identityId, tokenId }) {
    const response = await sdk.tokens.perpetualDistributionLastClaimWithProof(identityId, tokenId)
    const moment = response.data
    if (!moment) return { data: null, response }
    const data = momentDto(moment)
    moment.free?.()
    return { data, response }
  },

  async 'dpns.resolveName'(sdk, { name }) {
    return { data: (await sdk.dpns.resolveName(name)) ?? null }
  },
}
