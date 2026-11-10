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
  MasternodeListRequestSchema,
  MasternodeListResponseSchema,
  TransactionsWithProofsRequestSchema,
  TransactionsWithProofsResponseSchema,
  type BlockHeadersWithChainLocksResponse,
  type TransactionsWithProofsResponse,
  type GetBestBlockHeightResponse,
  type GetBlockResponse,
  type GetBlockchainStatusResponse,
  type GetMasternodeStatusResponse,
  type GetTransactionResponse,
  type MasternodeListResponse,
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

export type TransactionStreamEvent =
  | { kind: 'transactions'; transactions: Uint8Array[] }
  | { kind: 'instantSendLocks'; messages: Uint8Array[] }
  | { kind: 'merkleBlock'; block: Uint8Array }

export interface MasternodeListEvent {
  /** A serialized masternode list diff (the first is the full list). */
  diff: Uint8Array
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

    /** The masternode list: a full diff first, then one per change. Open until aborted. */
    masternodeListStream(
      net: NetworkId,
      opts?: DapiCallOptions,
    ): { node?: string; events: AsyncIterable<MasternodeListEvent> } {
      const handle = transport.stream(
        net,
        'subscribeToMasternodeList',
        toBinary(MasternodeListRequestSchema, create(MasternodeListRequestSchema)),
        opts,
      )
      async function* events(): AsyncGenerator<MasternodeListEvent> {
        for await (const bytes of handle.messages) {
          const m = decode<MasternodeListResponse>(MasternodeListResponseSchema, bytes, handle.node)
          yield { diff: m.masternodeListDiff }
        }
      }
      return { node: handle.node, events: events() }
    },

    /** Every transaction, InstantSend lock and merkle block from `fromHeight` on: a match-all bloom filter, open until aborted. */
    transactionStream(
      net: NetworkId,
      q: { fromHeight: number },
      opts?: DapiCallOptions,
    ): { node?: string; events: AsyncIterable<TransactionStreamEvent> } {
      const request = create(TransactionsWithProofsRequestSchema, {
        bloomFilter: { vData: new Uint8Array([0xff]), nHashFuncs: 1, nTweak: 0, nFlags: 0 },
        fromBlock: { case: 'fromBlockHeight', value: q.fromHeight },
        count: 0,
        sendTransactionHashes: false,
      })
      const handle = transport.stream(
        net,
        'subscribeToTransactionsWithProofs',
        toBinary(TransactionsWithProofsRequestSchema, request),
        opts,
      )
      async function* events(): AsyncGenerator<TransactionStreamEvent> {
        for await (const bytes of handle.messages) {
          const m = decode<TransactionsWithProofsResponse>(
            TransactionsWithProofsResponseSchema,
            bytes,
            handle.node,
          )
          if (m.responses.case === 'rawTransactions') {
            yield { kind: 'transactions', transactions: m.responses.value.transactions }
          } else if (m.responses.case === 'instantSendLockMessages') {
            yield { kind: 'instantSendLocks', messages: m.responses.value.messages }
          } else if (m.responses.case === 'rawMerkleBlock') {
            yield { kind: 'merkleBlock', block: m.responses.value }
          }
        }
      }
      return { node: handle.node, events: events() }
    },
  }
}

export type DapiRpc = ReturnType<typeof createDapiRpc>
