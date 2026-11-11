import type { LiveTxEvent, LiveTxStatus } from '@/data/core/live'
import type { DecodedTx } from '@/data/core/types'
import { stampOf, type SourceStamp, type Sourced } from '@/data/envelope'
import type { HyAddressTx } from '@/data/hyphen/schemas'

export interface PendingTx {
  txid: string
  /** Outputs paying the address minus the outputs of it that the transaction spends, in duffs. */
  net: bigint
  /** Already mined when it was seen: Hyphen's history, the fallback, lists only mined transactions. */
  confirmed: boolean
  stamp: SourceStamp
}

/** Outputs of the address a transaction may spend: `txid:vout` → value. */
export type Spendable = (outpoint: string) => bigint | undefined

/**
 * What a transaction does to one address, or undefined when it doesn't touch it. A raw transaction names the outputs
 * it spends but not their owner, so a spend counts only when `spendable` knows that output.
 */
export function effectOn(address: string, tx: DecodedTx, spendable: Spendable): bigint | undefined {
  let touches = false
  let net = 0n
  for (const out of tx.outputs) {
    if (out.address === address) {
      touches = true
      net += out.value
    }
  }
  for (const input of tx.inputs) {
    const value = spendable(`${input.txid}:${input.vout}`)
    if (value !== undefined) {
      touches = true
      net -= value
    }
  }
  return touches ? net : undefined
}

const MAX_SEEN = 5000

export type WatchStatus = 'connecting' | 'live' | 'reconnecting' | 'paused'

export interface WatchOptions {
  address: string
  signal: AbortSignal
  /** DAPI's live transaction feed (`coreLive`): subscribing opens it, the returned function releases it. */
  dapi: {
    transactions(listener: (event: LiveTxEvent) => void): () => void
    status(): LiveTxStatus
    subscribe(onChange: () => void): () => void
  }
  /** The newest transactions of the address from Hyphen: read only while DAPI's feed has given up. */
  recent(signal: AbortSignal): Promise<Sourced<HyAddressTx[]>>
  /** Outputs of the address known to the page (its UTXOs). */
  spendable: Spendable
  /** `paused`: the tab is in the background, so nothing is followed. */
  onStatus(status: WatchStatus): void
  onPending(tx: PendingTx): void
  /**
   * A block was mined (`mined` lists the transactions now confirmed), or the tab came back after missing events
   * (`mined` undefined): pending transactions may have been mined and the address may have moved.
   */
  onBlock(mined?: ReadonlySet<string>): void
  /** Whether the page is visible; `subscribe` calls back whenever that changes. */
  visibility?: { hidden(): boolean; subscribe(onChange: () => void): () => void }
  /** How often the fallback reads the address history. */
  every: number
  /** Waits between fallback reads; replaced in tests. */
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
 * Follows new transactions of one address (IN-06). DAPI's transaction stream carries every mempool transaction in
 * full, so each is checked here without another request. Only while that feed has given up (`fallbackHint`) is
 * Hyphen asked, for the address's own newest transactions every `every` ms. Nothing is followed while the tab is
 * hidden; one refresh makes up for it when the tab returns.
 */
export function watchAddress(opts: WatchOptions): void {
  const { signal, address, dapi, visibility } = opts
  const sleep = opts.sleep ?? sleepFor
  const now = opts.now ?? Date.now
  const seen = new Set<string>()
  const own = new Map<string, bigint>()
  let release: (() => void) | undefined
  let fallback: AbortController | undefined
  let missed = false
  let last: WatchStatus | undefined

  const hidden = () => visibility?.hidden() ?? false
  const spendable: Spendable = (outpoint) => own.get(outpoint) ?? opts.spendable(outpoint)

  const report = (status: WatchStatus) => {
    if (status === last) return
    last = status
    opts.onStatus(status)
  }

  const remember = (txid: string): boolean => {
    if (seen.has(txid)) return false
    if (seen.size >= MAX_SEEN) seen.clear()
    seen.add(txid)
    return true
  }

  const onEvent = (event: LiveTxEvent) => {
    if (signal.aborted) return
    if (event.kind === 'tx') {
      const { tx } = event
      if (seen.has(tx.txid)) return
      const net = effectOn(address, tx, spendable)
      if (net === undefined) return
      remember(tx.txid)
      tx.outputs.forEach((out, n) => {
        if (out.address === address) own.set(`${tx.txid}:${n}`, out.value)
      })
      const at = now()
      opts.onPending({
        txid: tx.txid,
        net,
        confirmed: false,
        stamp: { source: 'dapi', asOf: at, fetchedAt: at, proved: false },
      })
    } else if (event.kind === 'block') {
      opts.onBlock(new Set(event.txids))
    }
  }

  async function followHistory(ctrl: AbortController): Promise<void> {
    let known: Set<string> | undefined
    while (!ctrl.signal.aborted) {
      try {
        const page = await opts.recent(ctrl.signal)
        if (ctrl.signal.aborted) return
        const ids = new Set(page.data.map((t) => t.txHash))
        if (known) {
          const fresh = page.data.filter((t) => !known!.has(t.txHash))
          const stamp = stampOf(page)
          for (const t of [...fresh].reverse()) {
            if (!remember(t.txHash)) continue
            opts.onPending({ txid: t.txHash, net: t.netValue, confirmed: true, stamp })
          }
          if (fresh.length > 0) opts.onBlock(ids)
        }
        known = ids
      } catch {
        // the next read tries again
      }
      await sleep(opts.every, ctrl.signal)
    }
  }

  const stopFallback = () => {
    fallback?.abort()
    fallback = undefined
  }

  const sync = () => {
    if (signal.aborted) return
    if (hidden()) {
      release?.()
      release = undefined
      stopFallback()
      missed = true
      report('paused')
      return
    }
    release ??= dapi.transactions(onEvent)
    const status = dapi.status()
    if (!status.fallbackHint) {
      stopFallback()
    } else if (!fallback) {
      fallback = new AbortController()
      void followHistory(fallback)
    }
    report(
      status.fallbackHint || status.state === 'live'
        ? 'live'
        : status.state === 'reconnecting'
          ? 'reconnecting'
          : 'connecting',
    )
    if (missed) {
      missed = false
      opts.onBlock()
    }
  }

  const unsubscribeDapi = dapi.subscribe(sync)
  const unsubscribeVisibility = visibility?.subscribe(sync)
  sync()
  signal.addEventListener(
    'abort',
    () => {
      unsubscribeDapi()
      unsubscribeVisibility?.()
      release?.()
      stopFallback()
    },
    { once: true },
  )
}
