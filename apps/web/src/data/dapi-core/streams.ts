export const STREAM_LINGER_MS = 10_000
export const BACKOFF_START_MS = 1_000
export const BACKOFF_MAX_MS = 30_000
/** Consecutive failed connections after which a stream's owner may fall back to polling (§4.6). */
export const DEGRADE_AFTER_FAILURES = 3
const CLEAN_RECONNECT_MS = 250
/** A connection the server ends on schedule lives about 601 s; one that ends sooner counts as a failure. */
export const EXPECTED_LIFETIME_MS = 590_000
/** Backoff starts over only after a connection has stayed open this long, not on its first message. */
export const STABLE_AFTER_MS = 60_000

export type StreamState = 'idle' | 'connecting' | 'live' | 'reconnecting' | 'degraded'

export function backoffMs(failures: number): number {
  return Math.min(BACKOFF_MAX_MS, BACKOFF_START_MS * 2 ** Math.max(0, failures - 1))
}

export function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve()
    const done = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', done)
      resolve()
    }
    const timer = setTimeout(done, ms)
    signal.addEventListener('abort', done, { once: true })
  })
}

export interface SessionContext {
  signal: AbortSignal
  /** Consecutive connections that failed before delivering anything. */
  failures: number
  /** The node that served the previous connection, to be avoided this time. */
  avoidNode?: string
  /** Call when the connection delivers its first message. */
  markLive: (node?: string) => void
}

export interface SharedStreamOptions {
  /** Consumes one connection until the server ends it (return) or it fails (throw). */
  session: (ctx: SessionContext) => Promise<void>
  onState?: (state: StreamState, detail: { failures: number; error?: unknown }) => void
  /**
   * Called once the stream has failed `DEGRADE_AFTER_FAILURES` times in a row. Resolves when the stream should be
   * tried again; the owner polls in the meantime.
   */
  degraded?: (ctx: { signal: AbortSignal; failures: number }) => Promise<void>
  lingerMs?: number
  now?: () => number
}

/**
 * One connection shared by everyone who wants it (§4.6): the first `retain` opens it, the last `release` closes it
 * after a short linger. A connection that ends or fails is reopened with backoff, on another node.
 */
export class SharedStream {
  private holders = 0
  private abort: AbortController | undefined
  private lingerTimer: ReturnType<typeof setTimeout> | undefined
  private lastNode: string | undefined
  private currentState: StreamState = 'idle'

  constructor(private readonly opts: SharedStreamOptions) {}

  get state(): StreamState {
    return this.currentState
  }

  retain(): () => void {
    this.holders++
    if (this.lingerTimer) {
      clearTimeout(this.lingerTimer)
      this.lingerTimer = undefined
    }
    if (!this.abort) this.start()
    let released = false
    return () => {
      if (released) return
      released = true
      this.holders--
      if (this.holders > 0) return
      this.lingerTimer = setTimeout(() => {
        this.lingerTimer = undefined
        if (this.holders === 0) this.stop()
      }, this.opts.lingerMs ?? STREAM_LINGER_MS)
      ;(this.lingerTimer as { unref?: () => void }).unref?.()
    }
  }

  private setState(state: StreamState, failures: number, error?: unknown): void {
    this.currentState = state
    this.opts.onState?.(state, { failures, error })
  }

  private stop(): void {
    this.abort?.abort()
    this.abort = undefined
    this.setState('idle', 0)
  }

  private start(): void {
    const ctrl = new AbortController()
    this.abort = ctrl
    void this.loop(ctrl.signal)
  }

  private async loop(signal: AbortSignal): Promise<void> {
    const now = this.opts.now ?? Date.now
    let failures = 0
    while (!signal.aborted) {
      this.setState(
        failures === 0 && this.lastNode === undefined ? 'connecting' : 'reconnecting',
        failures,
      )
      let liveAt: number | undefined
      const lived = () => (liveAt === undefined ? 0 : now() - liveAt)
      try {
        await this.opts.session({
          signal,
          failures,
          avoidNode: failures > 0 ? this.lastNode : undefined,
          markLive: (node) => {
            liveAt ??= now()
            if (node) this.lastNode = node
            this.setState('live', failures)
          },
        })
        if (signal.aborted) return
        if (lived() >= STABLE_AFTER_MS) failures = 0
        if (lived() >= EXPECTED_LIFETIME_MS) {
          // The server's own end (601 s): reconnect straight away, and it is not a failure.
          await sleep(CLEAN_RECONNECT_MS, signal)
          continue
        }
        // Ending early is a failure even with a clean status: reopening at once on the same node would loop.
        failures++
        this.setState('reconnecting', failures)
        await this.pause(signal, failures)
      } catch (error) {
        if (signal.aborted) return
        if (lived() >= STABLE_AFTER_MS) failures = 0
        failures++
        this.setState('reconnecting', failures, error)
        await this.pause(signal, failures, error)
      }
    }
  }

  private async pause(signal: AbortSignal, failures: number, error?: unknown): Promise<void> {
    if (failures >= DEGRADE_AFTER_FAILURES && this.opts.degraded) {
      this.setState('degraded', failures, error)
      await this.opts.degraded({ signal, failures })
    } else {
      await sleep(backoffMs(failures), signal)
    }
  }
}
