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

export interface WatchOptions {
  address: string
  open(signal: AbortSignal): Promise<AsyncIterable<HyStreamEvent>>
  fetchTx(txid: string, signal: AbortSignal): Promise<Sourced<HyTxDetail | null>>
  onStatus(status: 'live' | 'reconnecting'): void
  onPending(tx: PendingTx): void
  /** A block was chain-locked: pending transactions may now be mined, and the address may have moved. */
  onBlock(): void
  signal: AbortSignal
  /** Wait between reconnects; replaced in tests. */
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>
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
 * time and dropping the oldest when the node is busier than that.
 */
export async function watchAddress(opts: WatchOptions): Promise<void> {
  const { signal, address } = opts
  const sleep = opts.sleep ?? sleepFor
  const seen = new Set<string>()
  const queue: string[] = []
  let running = 0

  const pump = () => {
    while (running < CONCURRENCY && queue.length > 0 && !signal.aborted) {
      const txid = queue.shift()
      if (txid === undefined) break
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

  let delay = 2000
  while (!signal.aborted) {
    try {
      const events = await opts.open(signal)
      opts.onStatus('live')
      delay = 2000
      for await (const event of events) {
        if (event.type === 'mempool_tx') {
          const txid = event.payload.txid ?? event.payload.txHash
          if (txid && !seen.has(txid)) {
            if (seen.size >= MAX_SEEN) seen.clear()
            seen.add(txid)
            queue.push(txid)
            if (queue.length > MAX_QUEUE) queue.shift()
            pump()
          }
        } else if (event.type === 'chain_lock') {
          opts.onBlock()
        }
      }
    } catch {
      // a failed or interrupted stream is retried below
    }
    if (signal.aborted) return
    opts.onStatus('reconnecting')
    await sleep(delay, signal)
    delay = Math.min(delay * 2, 30_000)
  }
}
