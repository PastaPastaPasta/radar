import { getDapiTransport, type DapiTransport } from '../dapi-core'
import type { Sourced } from '../envelope'
import { abortedError, SourceError } from '../errors'
import type { NetworkId } from '@/lib/network'
import {
  CURRENT_QUORUMS_REQUEST,
  decodeCurrentQuorums,
  QuorumsDecodeError,
  type CurrentQuorums,
} from './quorums'

const ATTEMPTS = 2

export interface PlatformDapiDeps {
  /** Read on every call, so a transport installed later takes effect. */
  transport: () => DapiTransport
  now: () => number
}

/**
 * Platform reads Radar sends over DAPI's gRPC-web itself, because the SDK does not pass them on. They carry no proof:
 * each is one evonode's word, stamped `proved: false`.
 */
export function createPlatformDapi(deps: PlatformDapiDeps) {
  /**
   * The validator sets, the rotation, and the proposer of the block the answer is at (`getCurrentQuorumsInfo`): about
   * 126 KB on mainnet. An answer that does not decode is refused, its node rested, and the read tried once elsewhere.
   */
  async function currentQuorums(
    net: NetworkId,
    signal?: AbortSignal,
  ): Promise<Sourced<CurrentQuorums>> {
    const avoidNodes: string[] = []
    for (let attempt = 0; ; attempt++) {
      if (signal?.aborted) throw abortedError('dapi')
      const transport = deps.transport()
      const reply = await transport.unary(net, 'getCurrentQuorumsInfo', CURRENT_QUORUMS_REQUEST, {
        signal,
        priority: 'list',
        avoidNodes,
      })
      try {
        const fetchedAt = deps.now()
        const data = decodeCurrentQuorums(reply.response, { net, now: fetchedAt })
        return {
          source: 'dapi',
          asOf: Math.min(data.meta.timeMs, fetchedAt),
          fetchedAt,
          proved: false,
          height: data.meta.height,
          ...(reply.node ? { node: reply.node } : {}),
          data,
        }
      } catch (e) {
        if (!(e instanceof QuorumsDecodeError)) throw e
        if (reply.node) transport.reportInvalid?.(net, reply.node, e.message)
        const refused = new SourceError({
          source: 'dapi',
          kind: 'invalid-response',
          message: e.message,
          node: reply.node,
        })
        if (attempt >= ATTEMPTS - 1 || !reply.node) throw refused
        avoidNodes.push(reply.node)
      }
    }
  }
  return { currentQuorums }
}

export const platformDapi = createPlatformDapi({
  transport: getDapiTransport,
  now: () => Date.now(),
})

export type { CurrentQuorums } from './quorums'
