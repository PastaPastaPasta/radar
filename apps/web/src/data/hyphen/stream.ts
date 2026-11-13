import type { NetworkId } from '@/lib/network'
import { sourceOff } from '../endpoints'
import { SourceError, disabledByMode } from '../errors'
import { healthRegistry } from '../health'
import { cancelled, describeFailure, requireEndpoint } from '../http'
import { HyStreamEventSchema, type HyStreamEvent } from './schemas'

/** A line longer than this is a broken stream, not an event. */
export const MAX_NDJSON_LINE_CHARS = 1_048_576

/** Live events as NDJSON. The iterator ends when `signal` aborts or the server closes the stream. */
export async function openHyphenStream(
  net: NetworkId,
  signal?: AbortSignal,
): Promise<AsyncIterable<HyStreamEvent>> {
  if (sourceOff('hyphen')) throw disabledByMode('hyphen')
  const url = `${requireEndpoint(net, 'hyphen', 'hyphen')}/stream`
  const started = performance.now()
  let res: Response
  try {
    res = await fetch(url, { signal, headers: { accept: 'application/x-ndjson' } })
  } catch (cause) {
    if (signal?.aborted) {
      throw cancelled('hyphen', cause)
    }
    const message = describeFailure('hyphen', 'network')
    healthRegistry.report(net, 'hyphen', {
      ok: false,
      latencyMs: performance.now() - started,
      kind: 'network',
      message,
    })
    throw new SourceError({ source: 'hyphen', kind: 'network', message, cause })
  }
  if (!res.ok || !res.body) {
    const message = describeFailure('hyphen', 'http', `HTTP ${res.status}`)
    healthRegistry.report(net, 'hyphen', {
      ok: false,
      latencyMs: performance.now() - started,
      kind: 'http',
      message,
    })
    throw new SourceError({ source: 'hyphen', kind: 'http', message, status: res.status })
  }
  healthRegistry.report(net, 'hyphen', { ok: true, latencyMs: performance.now() - started })
  return readNdjson(res.body, signal, (error) =>
    healthRegistry.report(net, 'hyphen', { ok: false, kind: error.kind, message: error.message }),
  )
}

/**
 * Splits a byte stream into NDJSON lines and yields each recognised event. Unknown event types and
 * malformed lines are skipped. A read failure or an over-long line throws a `SourceError` after
 * `onFailure` has seen it.
 */
export async function* readNdjson(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
  onFailure?: (error: SourceError) => void,
): AsyncGenerator<HyStreamEvent, void, undefined> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const onAbort = () => void reader.cancel().catch(() => undefined)
  signal?.addEventListener('abort', onAbort, { once: true })

  const failed = (init: ConstructorParameters<typeof SourceError>[0]): SourceError => {
    const error = new SourceError(init)
    onFailure?.(error)
    return error
  }

  const parse = (line: string): HyStreamEvent | undefined => {
    let raw: unknown
    try {
      raw = JSON.parse(line)
    } catch {
      return undefined
    }
    const parsed = HyStreamEventSchema.safeParse(raw)
    return parsed.success ? parsed.data : undefined
  }

  const tooLong = () =>
    failed({
      source: 'hyphen',
      kind: 'invalid-response',
      message: describeFailure('hyphen', 'invalid-response', 'stream line too long'),
    })

  try {
    for (;;) {
      if (signal?.aborted) return
      let chunk: ReadableStreamReadResult<Uint8Array>
      try {
        chunk = await reader.read()
      } catch (cause) {
        if (signal?.aborted) return
        throw failed({
          source: 'hyphen',
          kind: 'network',
          message: describeFailure('hyphen', 'network', 'stream interrupted'),
          cause,
        })
      }
      if (chunk.done) break
      buffer += decoder.decode(chunk.value, { stream: true })
      let nl: number
      while ((nl = buffer.indexOf('\n')) >= 0) {
        if (nl > MAX_NDJSON_LINE_CHARS) throw tooLong()
        const line = buffer.slice(0, nl).trim()
        buffer = buffer.slice(nl + 1)
        if (!line) continue
        const event = parse(line)
        if (event) yield event
      }
      if (buffer.length > MAX_NDJSON_LINE_CHARS) throw tooLong()
    }
    const tail = signal?.aborted ? '' : (buffer + decoder.decode()).trim()
    if (tail) {
      const event = parse(tail)
      if (event) yield event
    }
  } finally {
    signal?.removeEventListener('abort', onAbort)
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}
