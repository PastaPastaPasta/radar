import { create, fromBinary, toBinary } from '@bufbuild/protobuf'
import type { NetworkId } from '@/lib/network'
import { SourceError } from '../errors'
import {
  BlockHeadersWithChainLocksRequestSchema,
  BlockHeadersWithChainLocksResponseSchema,
  GetBestBlockHeightRequestSchema,
  GetBestBlockHeightResponseSchema,
  GetBlockRequestSchema,
  GetBlockResponseSchema,
  GetBlockchainStatusRequestSchema,
  GetBlockchainStatusResponseSchema,
  GetMasternodeStatusRequestSchema,
  GetMasternodeStatusResponseSchema,
  GetTransactionRequestSchema,
  GetTransactionResponseSchema,
  type BlockHeadersWithChainLocksResponse,
  type GetBestBlockHeightResponse,
  type GetBlockResponse,
  type GetBlockchainStatusResponse,
  type GetMasternodeStatusResponse,
  type GetTransactionResponse,
} from './gen/core/v0/core_pb'
import type { DapiCallOptions, DapiTransport } from './transport'

export interface Answered<T> {
  message: T
  node?: string
}

function decode<T>(schema: Parameters<typeof fromBinary>[0], bytes: Uint8Array, node?: string): T {
  try {
    return fromBinary(schema, bytes) as T
  } catch (cause) {
    throw new SourceError({
      source: 'dapi',
      kind: 'invalid-response',
      message: 'DAPI sent a response that is not a valid protobuf message',
      node,
      cause,
    })
  }
}

export type HeaderStreamEvent =
  { kind: 'headers'; headers: Uint8Array[] } | { kind: 'chainLock'; chainLock: Uint8Array }

/** The requests Radar sends, as typed calls over a `DapiTransport`. Requests are deterministic, so recordings replay by request bytes. */
export function createDapiRpc(transport: DapiTransport) {
  async function unary<T>(
    net: NetworkId,
    method: Parameters<DapiTransport['unary']>[1],
    request: Uint8Array,
    schema: Parameters<typeof fromBinary>[0],
    opts?: DapiCallOptions,
  ): Promise<Answered<T>> {
    const reply = await transport.unary(net, method, request, opts)
    return { message: decode<T>(schema, reply.response, reply.node), node: reply.node }
  }

  return {
    transport,

    status(net: NetworkId, opts?: DapiCallOptions): Promise<Answered<GetBlockchainStatusResponse>> {
      return unary(
        net,
        'getBlockchainStatus',
        toBinary(GetBlockchainStatusRequestSchema, create(GetBlockchainStatusRequestSchema)),
        GetBlockchainStatusResponseSchema,
        opts,
      )
    },

    bestHeight(
      net: NetworkId,
      opts?: DapiCallOptions,
    ): Promise<Answered<GetBestBlockHeightResponse>> {
      return unary(
        net,
        'getBestBlockHeight',
        toBinary(GetBestBlockHeightRequestSchema, create(GetBestBlockHeightRequestSchema)),
        GetBestBlockHeightResponseSchema,
        opts,
      )
    },

    block(
      net: NetworkId,
      ref: { height: number } | { hash: string },
      opts?: DapiCallOptions,
    ): Promise<Answered<GetBlockResponse>> {
      const request = create(GetBlockRequestSchema, {
        block:
          'height' in ref
            ? { case: 'height', value: ref.height }
            : { case: 'hash', value: ref.hash },
      })
      return unary(
        net,
        'getBlock',
        toBinary(GetBlockRequestSchema, request),
        GetBlockResponseSchema,
        opts,
      )
    },

    transaction(
      net: NetworkId,
      txid: string,
      opts?: DapiCallOptions,
    ): Promise<Answered<GetTransactionResponse>> {
      return unary(
        net,
        'getTransaction',
        toBinary(GetTransactionRequestSchema, create(GetTransactionRequestSchema, { id: txid })),
        GetTransactionResponseSchema,
        opts,
      )
    },

    masternodeStatus(
      net: NetworkId,
      opts?: DapiCallOptions,
    ): Promise<Answered<GetMasternodeStatusResponse>> {
      return unary(
        net,
        'getMasternodeStatus',
        toBinary(GetMasternodeStatusRequestSchema, create(GetMasternodeStatusRequestSchema)),
        GetMasternodeStatusResponseSchema,
        opts,
      )
    },

    /** `count = 0` follows the chain from `fromHeight` until aborted; `count = n` ends after n headers. */
    headerStream(
      net: NetworkId,
      q: { fromHeight: number; count: number },
      opts?: DapiCallOptions,
    ): { node?: string; events: AsyncIterable<HeaderStreamEvent> } {
      const request = create(BlockHeadersWithChainLocksRequestSchema, {
        fromBlock: { case: 'fromBlockHeight', value: q.fromHeight },
        count: q.count,
      })
      const handle = transport.stream(
        net,
        'subscribeToBlockHeadersWithChainLocks',
        toBinary(BlockHeadersWithChainLocksRequestSchema, request),
        opts,
      )
      async function* events(): AsyncGenerator<HeaderStreamEvent> {
        for await (const bytes of handle.messages) {
          const m = decode<BlockHeadersWithChainLocksResponse>(
            BlockHeadersWithChainLocksResponseSchema,
            bytes,
            handle.node,
          )
          if (m.responses.case === 'blockHeaders') {
            yield { kind: 'headers', headers: m.responses.value.headers }
          } else if (m.responses.case === 'chainLock') {
            yield { kind: 'chainLock', chainLock: m.responses.value }
          }
        }
      }
      return { node: handle.node, events: events() }
    },
  }
}

export type DapiRpc = ReturnType<typeof createDapiRpc>
