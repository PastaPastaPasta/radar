import type { Budget } from './budget'
import type { DapiStreamHandle, DapiTransport } from './transport'
import type { NetworkId } from '@/lib/network'

/** What the budget says before the pool exists: nothing has been spent, so lists may try DAPI. */
const OPEN_SNAPSHOT = {
  pressure: 'ok',
  headroom: 400,
  capacity: 400,
  benched: 0,
  usedLastMinute: 0,
} as const

/**
 * A transport that loads the real one on its first call. The pool, the gRPC-web client and the Core
 * protobuf runtime stay out of the entry chunk; the first page that asks for Core data pulls them in.
 */
export function createLazyDapiTransport(load: () => Promise<DapiTransport>): DapiTransport {
  let loaded: DapiTransport | undefined
  let loading: Promise<DapiTransport> | undefined
  const transport = (): Promise<DapiTransport> =>
    (loading ??= load().then(
      (t) => (loaded = t),
      (e: unknown) => {
        loading = undefined
        throw e
      },
    ))

  const listeners = new Set<() => void>()
  let unsubscribe: (() => void) | undefined
  const attach = (t: DapiTransport) => {
    unsubscribe ??= t.budget.subscribe(() => {
      for (const cb of [...listeners]) cb()
    })
  }

  const budget: Budget = {
    snapshot: (net: NetworkId) => loaded?.budget.snapshot(net) ?? { ...OPEN_SNAPSHOT },
    canAfford: (net: NetworkId, n: number) =>
      loaded ? loaded.budget.canAfford(net, n) : n <= OPEN_SNAPSHOT.capacity / 2,
    subscribe(cb) {
      listeners.add(cb)
      if (loaded) attach(loaded)
      else void transport().then(attach, () => undefined)
      return () => listeners.delete(cb)
    },
  }

  return {
    budget,
    async unary(net, method, request, opts) {
      return (await transport()).unary(net, method, request, opts)
    },
    stream(net, method, request, opts): DapiStreamHandle {
      let inner: DapiStreamHandle | undefined
      return {
        get node() {
          return inner?.node
        },
        messages: (async function* () {
          inner = (await transport()).stream(net, method, request, opts)
          yield* inner.messages
        })(),
      }
    },
  }
}
