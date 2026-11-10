import type { NetworkId } from '@/lib/network'
import { SourceError } from '../errors'
import { healthRegistry } from '../health'
import { cancelled, describeFailure, requireEndpoint } from '../http'
import { HyStreamEventSchema, type HyStreamEvent } from './schemas'

/** Live events as NDJSON. The iterator ends when `signal` aborts or the server closes the stream. */
export async function openHyphenStream(
  net: NetworkId,
  signal?: AbortSignal,
): Promise<AsyncIterable<HyStreamEvent>> {
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
  return readNdjson(res.body, signal)
}

/** Splits a byte stream into NDJSON lines and yields each recognised event. Unknown event types are skipped. */
export async function* readNdjson(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<HyStreamEvent, void, undefined> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const onAbort = () => void reader.cancel().catch(() => undefined)
  signal?.addEventListener('abort', onAbort, { once: true })

  const parse = (line: string): HyStreamEvent | undefined => {
    let raw: unknown
    try {
      raw = JSON.parse(line)
    } catch (cause) {
      throw new SourceError({
        source: 'hyphen',
        kind: 'invalid-response',
        message: describeFailure('hyphen', 'invalid-response', 'stream line is not JSON'),
        cause,
      })
    }
    const parsed = HyStreamEventSchema.safeParse(raw)
    return parsed.success ? parsed.data : undefined
  }

  try {
    for (;;) {
      if (signal?.aborted) return
      let chunk: ReadableStreamReadResult<Uint8Array>
      try {
        chunk = await reader.read()
      } catch (cause) {
        if (signal?.aborted) return
        throw new SourceError({
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
        const line = buffer.slice(0, nl).trim()
        buffer = buffer.slice(nl + 1)
        if (!line) continue
        const event = parse(line)
        if (event) yield event
      }
    }
    const tail = (buffer + decoder.decode()).trim()
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
