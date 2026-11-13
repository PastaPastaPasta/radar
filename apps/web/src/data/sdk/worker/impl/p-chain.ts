import type { PChainMethods, PrefundedBalanceDto, ShieldedNoteDto } from '../../methods'
import { bytesToHex, hexToBytes } from '@/lib/hex'
import { isNotFound } from '../errors'
import type { Freeable, ImplOf, ProvedResponse } from './types'

export interface PrefundedBalanceLike extends Freeable {
  balance: bigint
}

export interface ShieldedNoteLike extends Freeable {
  cmx: Uint8Array
  cvNet: Uint8Array
  encryptedNote: Uint8Array
  nullifier: Uint8Array
}

export interface NullifierStatusLike extends Freeable {
  isSpent: boolean
  nullifier: Uint8Array
}

/** The part of `EvoSDK` this package's methods read. */
export interface PChainReads {
  system: {
    prefundedSpecializedBalanceWithProof(
      id: string,
    ): Promise<ProvedResponse<PrefundedBalanceLike | null | undefined>>
  }
  shielded: {
    poolStateWithProof(): Promise<ProvedResponse<bigint | null | undefined>>
    anchorsWithProof(): Promise<ProvedResponse<Uint8Array[]>>
    mostRecentAnchorWithProof(): Promise<ProvedResponse<Uint8Array | null | undefined>>
    encryptedNotesWithProof(
      startIndex: bigint,
      count: number,
    ): Promise<ProvedResponse<ShieldedNoteLike[]>>
    nullifiersWithProof(nullifiers: Uint8Array[]): Promise<ProvedResponse<NullifierStatusLike[]>>
  }
}

type Impl<M extends keyof PChainMethods> = ImplOf<PChainReads, M>

export const prefundedBalanceDto = (id: string, b: PrefundedBalanceLike): PrefundedBalanceDto => ({
  id,
  balance: BigInt(b.balance),
})

export const shieldedNoteDto = (index: number, n: ShieldedNoteLike): ShieldedNoteDto => ({
  index,
  cmx: bytesToHex(n.cmx),
  cvNet: bytesToHex(n.cvNet),
  encryptedNote: bytesToHex(n.encryptedNote),
  nullifier: bytesToHex(n.nullifier),
})

export const pChainImpl: { [M in keyof PChainMethods]: Impl<M> } = {
  async 'system.prefundedSpecializedBalance'(sdk, { id }) {
    let response: ProvedResponse<PrefundedBalanceLike | null | undefined>
    try {
      response = await sdk.system.prefundedSpecializedBalanceWithProof(id)
    } catch (e) {
      // The SDK throws, rather than proving it, for a balance that is not there: the absence comes back unproved.
      if (isNotFound(e)) return { data: null }
      throw e
    }
    const balance = response.data
    if (!balance) return { data: null, response }
    const dto = prefundedBalanceDto(id, balance)
    balance.free?.()
    return { data: dto, response }
  },

  async 'shielded.poolState'(sdk) {
    const response = await sdk.shielded.poolStateWithProof()
    return { data: response.data ?? null, response }
  },

  async 'shielded.anchors'(sdk) {
    const response = await sdk.shielded.anchorsWithProof()
    return { data: response.data.map(bytesToHex), response }
  },

  async 'shielded.mostRecentAnchor'(sdk) {
    const response = await sdk.shielded.mostRecentAnchorWithProof()
    return { data: response.data ? bytesToHex(response.data) : null, response }
  },

  async 'shielded.encryptedNotes'(sdk, { startIndex, count }) {
    const response = await sdk.shielded.encryptedNotesWithProof(BigInt(startIndex), count)
    const data = response.data.map((note, i) => {
      const dto = shieldedNoteDto(startIndex + i, note)
      note.free?.()
      return dto
    })
    return { data, response }
  },

  async 'shielded.nullifiers'(sdk, { nullifiers }) {
    const response = await sdk.shielded.nullifiersWithProof(nullifiers.map(hexToBytes))
    const spent = new Set<string>()
    for (const status of response.data) {
      if (status.isSpent) spent.add(bytesToHex(status.nullifier))
      status.free?.()
    }
    return { data: new Map(nullifiers.map((n) => [n, spent.has(n.toLowerCase())])), response }
  },
}
