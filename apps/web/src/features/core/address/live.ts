import type { Sourced } from '@/data/envelope'
import type { HyStreamEvent, HyTxDetail } from '@/data/hyphen/schemas'

export interface PendingTx {
  txid: string
  /** Outputs paying the address minus inputs it spends, in duffs. */
  net: bigint
  tx: Sourced<HyTxDetail>
}

/** What an unconfirmed transaction does to one address, or undefined when it doesn't touch it. */
export function effectOn(address: string, tx: HyTxDetail): bigint | undefined {
  let touches = false
  let net = 0n
  for (const out of tx.vout) {
    if (out.address === address) {
      touches = true
      net += out.value
    }
  }
  for (const input of tx.vin) {
    if (input.address === address) {
      touches = true
      net -= input.value ?? 0n
    }
  }
  return touches ? net : undefined
}

const MAX_QUEUE = 100
const MAX_SEEN = 5000
const CONCURRENCY = 3
const MAX_FETCHES_PER_MINUTE = 60
const BACKOFF_START_MS = 2000
const BACKOFF_MAX_MS = 30_000
const STABLE_AFTER_MS = 30_000

export type WatchStatus = 'live' | 'reconnecting' | 'paused' | 'busy'

export interface WatchOptions {
  address: string
  open(signal: AbortSignal): Promise<AsyncIterable<HyStreamEvent>>
  fetchTx(txid: string, signal: AbortSignal): Promise<Sourced<HyTxDetail | null>>
  /**
   * `paused`: the tab is in the background, so nothing is fetched. `busy`: the mempool is moving faster
   * than the address check is allowed to follow, so some transactions are skipped.
   */
  onStatus(status: WatchStatus): void
  onPending(tx: PendingTx): void
  /**
   * A block was chain-locked: pending transactions may now be mined, and the address may have moved.
   * Also called when the tab comes back after missing events.
   */
  onBlock(): void
  signal: AbortSignal
  /** Whether the page is visible; `subscribe` calls back whenever that changes. */
  visibility?: { hidden(): boolean; subscribe(onChange: () => void): () => void }
  /** Wait between reconnects; replaced in tests. */
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>
  now?: () => number
}

const sleepFor = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        resolve()
      },
      { once: true },
    )
  })

/**
 * Follows Hyphen's event stream for transactions that touch one address. The stream carries a mempool
 * event per transaction without its addresses, so each new one is fetched and checked here, a few at a
 * time, at most {@link MAX_FETCHES_PER_MINUTE} a minute, and never while the tab is hidden. Whatever is
 * skipped is made up for by one refresh when the tab returns or the next block arrives.
 */
export async function watchAddress(opts: WatchOptions): Promise<void> {
  const { signal, address, visibility } = opts
  const sleep = opts.sleep ?? sleepFor
  const now = opts.now ?? Date.now
  const seen = new Set<string>()
  const queue: string[] = []
  const fetched: number[] = []
  let running = 0
  let missed = false
  let busy = false
  let connected = false

  const hidden = () => visibility?.hidden() ?? false
  const steady = (): WatchStatus => (connected ? 'live' : 'reconnecting')

  const withinRate = () => {
    const cutoff = now() - 60_000
    while (fetched.length > 0 && fetched[0]! <= cutoff) fetched.shift()
    return fetched.length < MAX_FETCHES_PER_MINUTE
  }

  const pump = () => {
    while (running < CONCURRENCY && queue.length > 0 && !signal.aborted) {
      if (!withinRate()) {
        queue.length = 0
        missed = true
        if (!busy) {
          busy = true
          opts.onStatus('busy')
        }
        return
      }
      const txid = queue.shift()
      if (txid === undefined) break
      if (busy) {
        busy = false
        opts.onStatus(steady())
      }
      fetched.push(now())
      running++
      opts
        .fetchTx(txid, signal)
        .then((tx) => {
          if (!tx.data || signal.aborted) return
          const detail = tx.data
          const net = effectOn(address, detail)
          if (net !== undefined) opts.onPending({ txid, net, tx: { ...tx, data: detail } })
        })
        .catch(() => undefined)
        .finally(() => {
          running--
          pump()
        })
    }
  }

  const resync = () => {
    missed = false
    opts.onBlock()
  }

  const unsubscribe = visibility?.subscribe(() => {
    if (signal.aborted) return
    if (hidden()) {
      queue.length = 0
      opts.onStatus('paused')
      return
    }
    opts.onStatus(steady())
    if (missed) resync()
  })
  signal.addEventListener('abort', () => unsubscribe?.(), { once: true })

  let delay = BACKOFF_START_MS
  while (!signal.aborted) {
    const startedAt = now()
    let delivered = false
    try {
      const events = await opts.open(signal)
      connected = true
      opts.onStatus(hidden() ? 'paused' : 'live')
      for await (const event of events) {
        delivered = true
        if (event.type === 'mempool_tx') {
          if (hidden()) {
            missed = true
            continue
          }
          const txid = event.payload.txid ?? event.payload.txHash
          if (txid && !seen.has(txid)) {
            if (seen.size >= MAX_SEEN) seen.clear()
            seen.add(txid)
            queue.push(txid)
            if (queue.length > MAX_QUEUE) queue.shift()
            pump()
          }
        } else if (event.type === 'chain_lock') {
          if (hidden()) missed = true
          else resync()
        }
      }
    } catch {
      // a failed or interrupted stream is retried below
    }
    if (signal.aborted) return
    connected = false
    opts.onStatus('reconnecting')
    if (delivered || now() - startedAt >= STABLE_AFTER_MS) delay = BACKOFF_START_MS
    await sleep(delay, signal)
    delay = Math.min(delay * 2, BACKOFF_MAX_MS)
  }
}
