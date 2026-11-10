import type { z } from 'zod'
import { getActiveNetwork } from './active-network'
import { endpoint, type EndpointSource } from './endpoints'
import type { SourceId, Sourced } from './envelope'
import { SourceError, type SourceErrorKind } from './errors'
import { healthRegistry } from './health'
import type { NetworkId } from '@/lib/network'

type HttpSource = Exclude<SourceId, 'sdk' | 'dapi' | 'local'>

export interface FetchSourcedRequest<S extends z.ZodType, N extends 'throw' | 'null' = 'throw'> {
  source: HttpSource
  url: string
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
  method?: 'GET' | 'POST'
  body?: unknown
  asOf?: (body: z.output<S>, res: Response) => number
  height?: (body: z.output<S>) => number | undefined
}

export const DEFAULT_TIMEOUT_MS = 10_000

const COMMON_MESSAGE: Partial<Record<SourceErrorKind, string>> = {
  network: "couldn't be reached",
  timeout: 'took too long to answer',
  'rate-limited': 'is rate limiting requests',
  'invalid-response': 'sent an answer that could not be read',
  unavailable: 'is not available on this network',
}

const SOURCE_NAME: Record<SourceId, string> = {
  sdk: 'The Platform SDK',
  dapi: 'DAPI',
  radar: 'Radar',
  pe: 'Platform Explorer',
  hyphen: 'Hyphen',
  rate: 'The price feed',
  local: 'This browser',
}

export function describeFailure(source: SourceId, kind: SourceErrorKind, detail?: string): string {
  const base = `${SOURCE_NAME[source]} ${COMMON_MESSAGE[kind] ?? 'returned an error'}`
  return detail ? `${base} (${detail})` : base
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

function issuePath(path: readonly PropertyKey[]): string {
  return path.map((p) => String(p)).join('.') || '(root)'
}

export async function fetchSourced<S extends z.ZodType, N extends 'throw' | 'null' = 'throw'>(
  req: FetchSourcedRequest<S, N>,
): Promise<Sourced<N extends 'null' ? z.output<S> | null : z.output<S>>> {
  type Out = N extends 'null' ? z.output<S> | null : z.output<S>
  const net = req.net ?? getActiveNetwork()
  const { source } = req
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
      healthRegistry.report(net, source, { ok: true, latencyMs: performance.now() - started })
    } else if (init.report !== false) {
      healthRegistry.report(net, source, {
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
    throw new SourceError({ source, kind: 'aborted', message: 'The request was cancelled' })
  }

  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  const onAbort = () => controller.abort()
  req.signal?.addEventListener('abort', onAbort, { once: true })

  try {
    let res: Response
    try {
      res = await fetch(resolveUrl(req.url), {
        method: req.method ?? 'GET',
        headers: {
          accept: 'application/json',
          ...(req.body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: req.body === undefined ? undefined : JSON.stringify(req.body),
        signal: controller.signal,
      })
    } catch (cause) {
      if (timedOut) throw fail({ kind: 'timeout', cause })
      if (req.signal?.aborted) {
        throw new SourceError({
          source,
          kind: 'aborted',
          message: 'The request was cancelled',
          cause,
        })
      }
      throw fail({ kind: 'network', cause })
    }

    const accepted = req.acceptStatus?.includes(res.status) === true
    if (!res.ok && !accepted) {
      if (res.status === 404) {
        if (req.notFound === 'null') {
          healthRegistry.report(net, source, { ok: true, latencyMs: performance.now() - started })
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
      if (timedOut) throw fail({ kind: 'timeout', cause })
      if (req.signal?.aborted) {
        throw new SourceError({
          source,
          kind: 'aborted',
          message: 'The request was cancelled',
          cause,
        })
      }
      throw fail({ kind: 'invalid-response', status: res.status, detail: 'not JSON', cause })
    }

    const parsed = req.schema.safeParse(json)
    if (!parsed.success) {
      const first = parsed.error.issues[0]
      console.error(
        `[radar] ${source} ${req.method ?? 'GET'} ${req.url} failed schema validation at ${
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

    const latencyMs = performance.now() - started
    healthRegistry.report(net, source, { ok: true, latencyMs })
    const body: z.output<S> = parsed.data
    const fetchedAt = Date.now()
    const out: Sourced<Out> = {
      source,
      asOf: req.asOf ? req.asOf(body, res) : fetchedAt,
      fetchedAt,
      proved: false,
      data: body as Out,
    }
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
