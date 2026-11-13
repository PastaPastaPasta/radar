import { describe, expect, it, vi } from 'vitest'
import { isSourceError, type SourceError } from '../errors'
import { healthRegistry, resetHealthRegistry } from '../health'
import { queryLog } from '../query-log'
import { MAX_NDJSON_LINE_CHARS, openHyphenStream, readNdjson } from './stream'
import type { HyStreamEvent } from './schemas'

const encoder = new TextEncoder()

function stream(chunks: (string | Error)[]): ReadableStream<Uint8Array> {
  const queue = [...chunks]
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      const next = queue.shift()
      if (next === undefined) controller.close()
      else if (next instanceof Error) controller.error(next)
      else controller.enqueue(encoder.encode(next))
    },
  })
}

async function drain(source: AsyncIterable<HyStreamEvent>): Promise<unknown> {
  try {
    for await (const event of source) void event
  } catch (error) {
    return error
  }
  return undefined
}

describe('readNdjson limits', () => {
  it('fails as invalid-response when a line grows past the cap without a newline', async () => {
    const seen: SourceError[] = []
    const chunk = 'x'.repeat(256 * 1024)
    const chunks = Array.from({ length: MAX_NDJSON_LINE_CHARS / chunk.length + 2 }, () => chunk)
    const error = await drain(readNdjson(stream(chunks), undefined, (e) => seen.push(e)))
    expect(isSourceError(error) && [error.source, error.kind]).toEqual([
      'hyphen',
      'invalid-response',
    ])
    expect(seen).toEqual([error])
  })

  it('fails on a single over-long line that does end in a newline', async () => {
    const error = await drain(readNdjson(stream(['x'.repeat(MAX_NDJSON_LINE_CHARS + 10) + '\n'])))
    expect(isSourceError(error) && error.kind).toBe('invalid-response')
  })

  it('keeps reading normal lines below the cap', async () => {
    const line = JSON.stringify({ type: 'heartbeat' }) + '\n'
    const error = await drain(readNdjson(stream([line.repeat(2000)])))
    expect(error).toBeUndefined()
  })

  it('tells onFailure when the connection drops mid-stream', async () => {
    const seen: SourceError[] = []
    const error = await drain(
      readNdjson(stream(['{"type":"heartbeat"}\n', new Error('reset')]), undefined, (e) =>
        seen.push(e),
      ),
    )
    expect(isSourceError(error) && error.kind).toBe('network')
    expect(seen).toHaveLength(1)
  })

  it('stays silent when the caller aborts', async () => {
    const controller = new AbortController()
    const onFailure = vi.fn()
    const body = new ReadableStream<Uint8Array>({
      pull() {
        controller.abort()
        return new Promise(() => undefined)
      },
    })
    expect(await drain(readNdjson(body, controller.signal, onFailure))).toBeUndefined()
    expect(onFailure).not.toHaveBeenCalled()
  })
})

describe('openHyphenStream health', () => {
  it('reports a mid-stream failure for the network it was opened on', async () => {
    const body = stream(['{"type":"heartbeat"}\n', new Error('reset')])
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(body))
    try {
      await drain(await openHyphenStream('testnet'))
    } finally {
      fetchSpy.mockRestore()
    }
    expect(healthRegistry.get('testnet', 'hyphen').lastError?.kind).toBe('network')
    expect(healthRegistry.get('mainnet', 'hyphen').state).toBe('unknown')
  })

  it('logs each stream it opens, and each failure to open one', async () => {
    queryLog.clear()
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(stream([])))
      .mockResolvedValueOnce(new Response('no', { status: 503 }))
    try {
      await drain(await openHyphenStream('testnet'))
      await expect(openHyphenStream('testnet')).rejects.toMatchObject({ kind: 'http' })
    } finally {
      fetchSpy.mockRestore()
    }
    expect(queryLog.snapshot().map((e) => [e.source, e.what, e.ok, e.kind])).toEqual([
      ['hyphen', 'GET /stream', true, undefined],
      ['hyphen', 'GET /stream', false, 'http'],
    ])
  })

  it('leaves the latency window alone when an open stream breaks', async () => {
    vi.useFakeTimers()
    resetHealthRegistry()
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        await new Promise((resolve) => setTimeout(resolve, 40 * 60_000))
        controller.error(new Error('reset'))
      },
    })
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(body))
    try {
      const events = await openHyphenStream('mainnet')
      const done = drain(events)
      await vi.advanceTimersByTimeAsync(41 * 60_000)
      await done
    } finally {
      fetchSpy.mockRestore()
      vi.useRealTimers()
    }
    const health = healthRegistry.get('mainnet', 'hyphen')
    expect(health.lastError?.kind).toBe('network')
    expect(health.p50LatencyMs).toBeLessThan(1000)
  })
})
