import { fetchSourced, requireEndpoint } from '../http'
import type { Sourced } from '../envelope'
import { PeRateSchema } from '../pe/schemas'

export interface UsdRate {
  usd: number
  provider: string
}

const RateSchema = PeRateSchema.transform((r): UsdRate => ({ usd: r.usd, provider: r.source }))

export const rate = {
  /**
   * USD per DASH from Platform Explorer's mainnet `/rate`; the one price source on every network.
   * Reported to the active network's health record, which is the one `useSourceHealth('rate')` reads.
   */
  usd(signal?: AbortSignal): Promise<Sourced<UsdRate>> {
    return fetchSourced({
      source: 'rate',
      url: `${requireEndpoint('mainnet', 'rate', 'rate')}/rate`,
      schema: RateSchema,
      signal,
    })
  },
}
