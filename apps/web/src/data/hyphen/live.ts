import type { NetworkId } from '@/lib/network'
import { POLL_MS } from '../query/stale'
import { hyphen } from './client'
import type { HyStreamEvent } from './schemas'

const MAX_KNOWN = 2000

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        resolve()
      },
      { once: true },
    )
  })

/**
 * `mempool_tx` events made from the mempool list: the ids that appear after the first look. Hyphen's own
 * stream does not carry them in practice, so a page that wants new transactions follows the list as well.
 */
export async function* newMempoolTxs(
  listIds: (signal?: AbortSignal) => Promise<string[]>,
  signal?: AbortSignal,
  every: number = POLL_MS.mempool,
  sleep: (ms: number, signal?: AbortSignal) => Promise<void> = wait,
): AsyncGenerator<HyStreamEvent, void, undefined> {
  let known: Set<string> | undefined
  while (!signal?.aborted) {
    try {
      const ids = await listIds(signal)
      if (known) {
        for (const txid of [...ids].reverse()) {
          if (!known.has(txid))
            yield { type: 'mempool_tx', ts: Math.floor(Date.now() / 1000), payload: { txid } }
        }
      }
      if (!known || known.size > MAX_KNOWN) known = new Set()
      for (const id of ids) known.add(id)
    } catch {
      // the next look tries again
    }
    await sleep(every, signal)
  }
}

/** Both sources as one stream; it ends when the first one does, and a failure of the stream is passed on. */
export async function* mergeEvents(
  stream: AsyncIterable<HyStreamEvent>,
  extra: AsyncIterable<HyStreamEvent>,
  controller: AbortController,
): AsyncGenerator<HyStreamEvent, void, undefined> {
  const queue: HyStreamEvent[] = []
  let wake: (() => void) | undefined
  let finished = false
  let failure: { error: unknown } | undefined
  const notify = () => wake?.()
  const drain = async (source: AsyncIterable<HyStreamEvent>, primary: boolean) => {
    try {
      for await (const event of source) {
        queue.push(event)
        notify()
      }
    } catch (error) {
      if (primary) failure = { error }
    } finally {
      if (primary) {
        finished = true
        controller.abort()
        notify()
      }
    }
  }
  void drain(stream, true)
  void drain(extra, false)
  for (;;) {
    const next = queue.shift()
    if (next) {
      yield next
      continue
    }
    if (finished) break
    await new Promise<void>((resolve) => {
      wake = resolve
    })
  }
  if (failure) throw failure.error
}

/**
 * Live events for the address page (IN-06): Hyphen's stream, plus the mempool list followed for new
 * transactions. The raw stream stays out of `hyQueries` and `data/hyphen/index.ts` (§5.5).
 */
export async function openAddressEvents(
  net: NetworkId,
  signal?: AbortSignal,
): Promise<AsyncIterable<HyStreamEvent>> {
  const stream = await hyphen.stream(net, signal)
  const controller = new AbortController()
  signal?.addEventListener('abort', () => controller.abort(), { once: true })
  const extra = newMempoolTxs(async (s) => {
    const page = await hyphen.mempoolTxs(net, { limit: 50 }, s)
    return page.data.items.map((tx) => tx.txHash)
  }, controller.signal)
  return mergeEvents(stream, extra, controller)
}
