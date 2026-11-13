import { budget } from '@/data/dapi-core/budget'
import type { sdk as sdkClient } from '@/data/sdk/client'
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
  /** Chain tips the open pages already hold (`useSearchTip` publishes them); narrows numeric input. */
  tip(net: NetworkId): Tip | undefined
  /** Records the tips the hook read, so resolvers and `tip()` see what the page sees. */
  publishTip(net: NetworkId, tip: Tip | undefined): void
  /** Runs `cb` whenever the SDK's state may have changed. */
  subscribeSdk(cb: () => void): () => void
}

type SdkClient = typeof sdkClient

let client: SdkClient | undefined
let loading: Promise<SdkClient> | undefined
let unlisten: (() => void) | undefined
const listeners = new Set<() => void>()
const tips = new Map<NetworkId, Tip>()

const emit = () => {
  for (const cb of [...listeners]) cb()
}

/** The SDK client is loaded on first use, so the search code that ships with the app never carries it. */
function loadSdk(): Promise<SdkClient> {
  loading ??= import('@/data/sdk/client').then((m) => {
    client = m.sdk
    unlisten = m.sdk.subscribe(emit)
    emit()
    return m.sdk
  })
  return loading
}

export const searchEnv: SearchEnv = {
  canAffordDapi(net) {
    try {
      return budget.canAfford(net, 1)
    } catch {
      return false
    }
  },
  sdkState(net) {
    if (!client) {
      void loadSdk().catch(() => undefined)
      return 'cold'
    }
    return client.state(net)
  },
  warmSdk(net) {
    void loadSdk().then(
      (sdk) => {
        sdk.warm(net)
      },
      () => undefined,
    )
  },
  tip: (net) => tips.get(net),
  publishTip(net, tip) {
    const before = JSON.stringify(tips.get(net) ?? null)
    if (JSON.stringify(tip ?? null) === before) return
    if (tip) tips.set(net, tip)
    else tips.delete(net)
  },
  subscribeSdk(cb) {
    listeners.add(cb)
    return () => {
      listeners.delete(cb)
    }
  },
}

/** Only for tests: forgets the loaded client and every published tip. */
export function resetSearchEnv(): void {
  unlisten?.()
  unlisten = undefined
  client = undefined
  loading = undefined
  tips.clear()
}
