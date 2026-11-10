import { queryOptions } from '@tanstack/react-query'
import type { NetworkId } from '@/lib/network'
import { mapSourced, type Sourced } from '../envelope'
import { sdkKeys } from '../query/keys'
import { dataClass, type DataClass } from '../query/stale'
import { sdk } from './client'
import type { EpochDto, SdkMethodName, SdkMethods } from './methods'

const CLASS_OF: Record<SdkMethodName, DataClass> = {
  'identities.fetch': 'live',
  'identities.balances': 'live',
  'contracts.getMany': 'structural',
  'system.status': 'live',
  'system.totalCredits': 'live',
  'epoch.current': 'live',
}

function factory<M extends SdkMethodName>(method: M) {
  return (net: NetworkId, args: SdkMethods[M]['args']) =>
    queryOptions({
      queryKey: sdkKeys(net, method, args),
      queryFn: ({ signal }) => sdk.call(net, method, args, signal),
      ...dataClass(CLASS_OF[method]),
    })
}

type Factories = { [M in SdkMethodName]: ReturnType<typeof factory<M>> }

/** One query factory per method in the map (§3.3). */
export const sdkQueries = Object.fromEntries(
  (Object.keys(CLASS_OF) as SdkMethodName[]).map((m) => [m, factory(m)]),
) as unknown as {
  [M in SdkMethodName]: (net: NetworkId, args: SdkMethods[M]['args']) => ReturnType<Factories[M]>
}

export interface PlatformTip {
  /** The Platform block the proof refers to. */
  height: number
  epoch: { number: number; firstBlockHeight: number; startedAt: number }
}

export const platformTipOf = (s: Sourced<EpochDto>): Sourced<PlatformTip> =>
  mapSourced(s, (e) => ({
    height: s.height ?? e.firstBlockHeight,
    epoch: { number: e.index, firstBlockHeight: e.firstBlockHeight, startedAt: e.firstBlockTimeMs },
  }))

/**
 * Platform height and the current epoch from one proof-checked `getEpochsInfo`: the height is the proof's own block
 * height, so the stamp reads "Proof-checked". Shares the `epoch.current` cache entry.
 */
export const platformTipQuery = (net: NetworkId) =>
  queryOptions({
    ...sdkQueries['epoch.current'](net, {}),
    select: platformTipOf,
  })
