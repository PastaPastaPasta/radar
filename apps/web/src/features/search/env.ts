import { budget } from '@/data/dapi-core/budget'
import type { NetworkId } from '@/lib/network'
import type { Tip } from './classify'

export type SdkState = 'cold' | 'loading' | 'ready' | 'failed'

export interface SearchEnv {
  /** Whether a DAPI resolver may spend a request now. */
  canAffordDapi(net: NetworkId): boolean
  /** The Platform SDK's state; SDK resolvers run in the palette only when 'ready'. */
  sdkState(net: NetworkId): SdkState
  /** Start loading the SDK. The palette calls it when it opens. */
  warmSdk(net: NetworkId): void
  /** Known chain tips, used to narrow numeric input. */
  tip(net: NetworkId): Tip | undefined
}

export const searchEnv: SearchEnv = {
  canAffordDapi(net) {
    try {
      return budget.canAfford(net, 1)
    } catch {
      return false
    }
  },
  sdkState: () => 'cold',
  warmSdk: () => undefined,
  tip: () => undefined,
}
