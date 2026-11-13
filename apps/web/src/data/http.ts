import { t } from '@lingui/core/macro'
import type { z } from 'zod'
import { getActiveNetwork } from './active-network'
import { endpoint, sourceOff, type EndpointSource } from './endpoints'
import type { SourceId, Sourced } from './envelope'
import { SourceError, disabledByMode, type SourceErrorKind } from './errors'
import { healthRegistry } from './health'
import { queryLog } from './query-log'
import type { NetworkId } from '@/lib/network'

type HttpSource = Exclude<SourceId, 'sdk' | 'dapi' | 'local'>

export interface FetchSourcedRequest<S extends z.ZodType, N extends 'throw' | 'null' = 'throw'> {
  source: HttpSource
  /** A function defers endpoint lookup so a missing endpoint rejects the promise instead of throwing at the call. */
  url: string | (() => string)
  schema: S
  /** Network the call is reported to in the health registry; the active network when omitted. */
  net?: NetworkId
  signal?: AbortSignal
  /** Default 10_000. */
  timeoutMs?: number
  /** Default 'throw'; detail endpoints pass 'null' so 404 → Sourced<null>. */
  notFound?: N
  /** Non-2xx statuses whose body is still parsed with `schema` (Radar's 503 health report). */
  acceptStatus?: readonly number[]
  /**
   * Called with a parsed body (including an `acceptStatus` one). A returned failure is thrown and reported
   * to health once, with the call's real latency, instead of the call counting as a success.
   */
  reject?: (
    body: z.output<S>,
    res: Response,
  ) => { kind: SourceErrorKind; detail?: string } | undefined
  method?: 'GET' | 'POST'
  body?: unknown
  /** Defaults to `fetchedAt`; returning undefined also means `fetchedAt`. */
  asOf?: (body: z.output<S>, res: Response, fetchedAt: number) => number | undefined
  height?: (body: z.output<S>) => number | undefined
}

export const DEFAULT_TIMEOUT_MS = 10_000

function sourceName(source: SourceId): string {
  switch (source) {
    case 'sdk':
      return t`The Platform SDK`
    case 'dapi':
      return 'DAPI'
    case 'radar':
      return 'Radar'
    case 'pe':
      return 'Platform Explorer'
    case 'hyphen':
      return 'Hyphen'
    case 'insight':
      return 'Insight'
    case 'rate':
      return t`The price feed`
    case 'local':
      return t`This browser`
  }
}

function failureText(name: string, kind: SourceErrorKind): string {
  switch (kind) {
    case 'network':
      return t`${name} couldn’t be reached`
    case 'timeout':
      return t`${name} took too long to answer`
    case 'rate-limited':
      return t`${name} is rate limiting requests`
    case 'invalid-response':
      return t`${name} sent an answer that could not be read`
    case 'unavailable':
      return t`${name} is not available on this network`
    case 'disabled-by-mode':
      return t`${name} is a hosted service, which Decentralized only mode does not use`
    default:
      return t`${name} returned an error`
  }
}

export function describeFailure(source: SourceId, kind: SourceErrorKind, detail?: string): string {
  const base = failureText(sourceName(source), kind)
  return detail ? t`${base} (${detail})` : base
}

/** Base URL for an HTTP source, or a thrown `unavailable` error where the network has none. */
export function requireEndpoint(net: NetworkId, source: EndpointSource, as: SourceId): string {
  const base = endpoint(net, source)
  if (base === null) {
    throw new SourceError({
      source: as,
      kind: 'unavailable',
      message: describeFailure(as, 'unavailable'),
    })
  }
  return base
}

function resolveUrl(url: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return url
  const base = (globalThis as { location?: { href?: string } }).location?.href
  return base ? new URL(url, base).toString() : url
}

function retryAfterMs(res: Response): number | undefined {
  const h = res.headers.get('retry-after')
  if (!h) return undefined
  const secs = Number(h)
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000)
  const at = Date.parse(h)
  return Number.isNaN(at) ? undefined : Math.max(0, at - Date.now())
}

async function errorDetail(res: Response): Promise<string> {
  const fallback = `HTTP ${res.status}`
  try {
    const body = (await res.json()) as unknown
    if (body && typeof body === 'object') {
      const o = body as { error?: unknown; message?: unknown }
      const nested =
        o.error && typeof o.error === 'object' ? (o.error as { message?: unknown }) : undefined
      const msg = [nested?.message, o.message, o.error].find((m) => typeof m === 'string')
      if (typeof msg === 'string' && msg) return `${fallback}: ${msg.slice(0, 160)}`
    }
  } catch {
    // an unreadable body leaves just the status
  }
  return fallback
}

export function cancelled(source: SourceId, cause?: unknown): SourceError {
  return new SourceError({ source, kind: 'aborted', message: t`The request was cancelled`, cause })
}

function issuePath(path: readonly PropertyKey[]): string {
  return path.map((p) => String(p)).join('.') || '(root)'
}

function logWhat(req: FetchSourcedRequest<z.ZodType, 'throw' | 'null'>): string {
  const method = req.method ?? 'GET'
  try {
    const url = typeof req.url === 'function' ? req.url() : req.url
    return `${method} ${new URL(url, 'http://radar.invalid').pathname}`
  } catch {
    return `${method} ${req.source}`
  }
}

/** Reads one answer from a hosted source and records the call for Tools → Diagnostics (§11.5). */
export async function fetchSourced<S extends z.ZodType, N extends 'throw' | 'null' = 'throw'>(
  req: FetchSourcedRequest<S, N>,
): Promise<Sourced<N extends 'null' ? z.output<S> | null : z.output<S>>> {
  const net = req.net ?? getActiveNetwork()
  const started = performance.now()
  const log = (extra: { ok: boolean; kind?: SourceErrorKind; refusedByMode?: boolean }) => {
    queryLog.push({
      net,
      source: req.source,
      what: extra.refusedByMode ? `${req.method ?? 'GET'} ${req.source}` : logWhat(req),
      tookMs: Math.round(performance.now() - started),
      ...extra,
    })
  }
  try {
    const out = await readSourced(req)
    log({ ok: true })
    return out
  } catch (e) {
    if (e instanceof SourceError) {
      log(
        e.kind === 'disabled-by-mode'
          ? { ok: false, kind: e.kind, refusedByMode: true }
          : { ok: false, kind: e.kind },
      )
    } else log({ ok: false, kind: 'network' })
    throw e
  }
}

async function readSourced<S extends z.ZodType, N extends 'throw' | 'null' = 'throw'>(
  req: FetchSourcedRequest<S, N>,
): Promise<Sourced<N extends 'null' ? z.output<S> | null : z.output<S>>> {
  type Out = N extends 'null' ? z.output<S> | null : z.output<S>
  // The one gate of Decentralized only mode for every HTTP client: refused before the URL is built, before any
  // network I/O, and without a health report, because a source that is off is not a source that failed.
  if (sourceOff(req.source)) throw disabledByMode(req.source)
  const net = req.net ?? getActiveNetwork()
  const report = (r: Parameters<typeof healthRegistry.report>[2]) =>
    healthRegistry.report(net, source, r)
  const { source } = req
  const url = typeof req.url === 'function' ? req.url() : req.url
  const started = performance.now()
  const timeoutMs = req.timeoutMs ?? DEFAULT_TIMEOUT_MS

  const fail = (init: {
    kind: SourceErrorKind
    status?: number
    retryAfterMs?: number
    detail?: string
    cause?: unknown
    report?: boolean
    reportOk?: boolean
  }): SourceError => {
    const message = describeFailure(source, init.kind, init.detail)
    if (init.reportOk) {
      report({ ok: true, latencyMs: performance.now() - started })
    } else if (init.report !== false) {
      report({
        ok: false,
        latencyMs: performance.now() - started,
        kind: init.kind,
        message,
      })
    }
    return new SourceError({
      source,
      kind: init.kind,
      message,
      status: init.status,
      retryAfterMs: init.retryAfterMs,
      cause: init.cause,
    })
  }

  if (req.signal?.aborted) {
    throw cancelled(source)
  }

  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  const interrupted = (cause: unknown): SourceError | undefined => {
    if (timedOut) return fail({ kind: 'timeout', cause })
    if (req.signal?.aborted) return cancelled(source, cause)
    return undefined
  }
  const onAbort = () => controller.abort()
  req.signal?.addEventListener('abort', onAbort, { once: true })

  try {
    let res: Response
    try {
      res = await fetch(resolveUrl(url), {
        method: req.method ?? 'GET',
        headers: {
          accept: 'application/json',
          ...(req.body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: req.body === undefined ? undefined : JSON.stringify(req.body),
        signal: controller.signal,
      })
    } catch (cause) {
      throw interrupted(cause) ?? fail({ kind: 'network', cause })
    }

    const accepted = req.acceptStatus?.includes(res.status) === true
    if (!res.ok && !accepted) {
      if (res.status === 404) {
        if (req.notFound === 'null') {
          report({ ok: true, latencyMs: performance.now() - started })
          const now = Date.now()
          return { source, asOf: now, fetchedAt: now, proved: false, data: null as Out }
        }
        throw fail({ kind: 'http', status: 404, reportOk: true, detail: await errorDetail(res) })
      }
      if (res.status === 429) {
        throw fail({ kind: 'rate-limited', status: 429, retryAfterMs: retryAfterMs(res) })
      }
      throw fail({
        kind: 'http',
        status: res.status,
        detail: await errorDetail(res),
        reportOk: res.status < 500,
      })
    }

    let json: unknown
    try {
      json = await res.json()
    } catch (cause) {
      throw (
        interrupted(cause) ??
        fail({ kind: 'invalid-response', status: res.status, detail: 'not JSON', cause })
      )
    }

    const parsed = req.schema.safeParse(json)
    if (!parsed.success) {
      const first = parsed.error.issues[0]
      console.error(
        `[radar] ${source} ${req.method ?? 'GET'} ${url} failed schema validation at ${
          first ? issuePath(first.path) : '(root)'
        }: ${first?.message ?? 'invalid'}`,
        parsed.error.issues,
      )
      throw fail({
        kind: 'invalid-response',
        status: res.status,
        detail: first ? issuePath(first.path) : undefined,
        cause: parsed.error,
      })
    }

    const body: z.output<S> = parsed.data
    const rejected = req.reject?.(body, res)
    if (rejected) throw fail({ ...rejected, status: res.status })

    report({ ok: true, latencyMs: performance.now() - started })
    const fetchedAt = Date.now()
    const sourceTime = req.asOf?.(body, res, fetchedAt)
    const out: Sourced<Out> = {
      source,
      asOf: sourceTime ?? fetchedAt,
      fetchedAt,
      proved: false,
      data: body as Out,
    }
    if (sourceTime === undefined) out.asOfFetched = true
    const height = req.height?.(body)
    if (height !== undefined) out.height = height
    return out
  } finally {
    clearTimeout(timer)
    req.signal?.removeEventListener('abort', onAbort)
  }
}

/** Last-Modified as ms epoch, for sources that publish no time field of their own. */
export function lastModifiedMs(res: Response): number | undefined {
  const h = res.headers.get('last-modified')
  if (!h) return undefined
  const ms = Date.parse(h)
  return Number.isNaN(ms) ? undefined : ms
}
