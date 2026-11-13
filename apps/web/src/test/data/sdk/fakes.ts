import type { ProvedResponse, SdkReads } from '@/data/sdk/worker/impl'
import type { SdkHandle } from '@/data/sdk/worker/api'

const bytes = (n: number, fill: number) => new Uint8Array(n).fill(fill)

export function proved<T>(
  data: T,
  over: Partial<ProvedResponse<T>['metadata']> = {},
): ProvedResponse<T> {
  return {
    data,
    metadata: {
      height: 700_000n,
      coreChainLockedHeight: 2_570_000,
      epoch: 88,
      timeMs: 1_794_337_000_000n,
      protocolVersion: 14,
      chainId: new TextEncoder().encode('evo1'),
      ...over,
    },
    proof: {
      grovedbProof: bytes(40, 1),
      quorumHash: bytes(32, 2),
      signature: bytes(96, 3),
      round: 1,
      blockIdHash: bytes(32, 4),
      quorumType: 4,
    },
    free: () => undefined,
  }
}

export const fakeIdentity = (id: string, balance = 5n) => ({
  id,
  balance,
  revision: 3n,
  publicKeys: [
    {
      keyId: 0,
      keyTypeNumber: 0,
      purposeNumber: 0,
      securityLevelNumber: 0,
      isReadOnly: false,
      disabledAt: undefined,
      data: bytes(33, 9),
    },
    {
      keyId: 1,
      keyTypeNumber: 2,
      purposeNumber: 3,
      securityLevelNumber: 2,
      isReadOnly: true,
      disabledAt: 1234n,
      data: bytes(20, 8),
    },
  ],
})

type LooseReads = { [K in keyof SdkReads]?: Partial<SdkReads[K]> }

/** A facade with the groups a test names; every other call rejects. */
export function fakeReads(over: LooseReads = {}): SdkReads {
  const unused = () => Promise.reject(new Error('unused'))
  const base: Record<string, Record<string, unknown>> = {
    identities: { fetchWithProof: unused, balancesWithProof: unused },
    contracts: { getManyWithProof: unused },
    epoch: { currentWithProof: unused },
    system: { status: unused, totalCreditsInPlatformWithProof: unused },
  }
  const merged = { ...base }
  for (const [group, members] of Object.entries(over)) {
    merged[group] = { ...base[group], ...(members as Record<string, unknown>) }
  }
  return merged as unknown as SdkReads
}

export function fakeHandle(reads: SdkReads, free = () => undefined): SdkHandle {
  return { reads, protocolVersion: 14, free }
}
