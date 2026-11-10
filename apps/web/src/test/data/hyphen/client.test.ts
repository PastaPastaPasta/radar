import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { streamLines } from '@/test/fixtures/load'
import { server } from '@/test/server'
import { isSourceError } from '@/data/errors'
import { healthRegistry } from '@/data/health'
import { hyphen } from '@/data/hyphen/client'
import { cursorFromHeight, decodeCursor } from '@/data/hyphen/params'
import { openHyphenStream, readNdjson } from '@/data/hyphen/stream'

const ADDRESS = 'XnT33zjrFKjt3ymfyQZs2FPiKNer3WVj14'
const BLOCK = '0000000000000002f8d327ba50aca312c62c370edb505ad612845f58885df98c'

const bytes = (...parts: string[]) => {
  const enc = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(c) {
      for (const p of parts) c.enqueue(enc.encode(p))
      c.close()
    },
  })
}

async function collect<T>(it: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = []
  for await (const v of it) out.push(v)
  return out
}

describe('hyphen cursor', () => {
  it('is hex-encoded JSON with asOfHeight first', () => {
    const c = cursorFromHeight(2_570_005, 2_570_003)
    expect(Buffer.from(c, 'hex').toString()).toBe('{"asOfHeight":2570005,"height":2570003}')
    expect(c).toBe('7b2261734f66486569676874223a323537303030352c22686569676874223a323537303030337d')
  })

  it('round-trips through decodeCursor and rejects junk', () => {
    expect(decodeCursor(cursorFromHeight(10, 5))).toEqual({ asOfHeight: 10, height: 5 })
    expect(decodeCursor('zz')).toBeNull()
    expect(decodeCursor('abc')).toBeNull()
    expect(decodeCursor(Buffer.from('[1]').toString('hex'))).toBeNull()
    expect(decodeCursor(Buffer.from('nope').toString('hex'))).toBeNull()
  })

  it('reads the cursor Hyphen itself issued', async () => {
    const page = await hyphen.blocks('mainnet', { limit: 20 })
    expect(page.data.nextCursor).toBeDefined()
    const decoded = decodeCursor(page.data.nextCursor!)
    expect(decoded).toMatchObject({ asOfHeight: page.data.asOfHeight })
    expect(decoded?.height).toBe(page.data.items[page.data.items.length - 1]?.blockHeight)
  })

  it('blocksFrom asks for the page that starts at the requested height', async () => {
    const seen: string[] = []
    server.use(
      http.get('*/x/hy/mainnet/blocks', ({ request }) => {
        seen.push(new URL(request.url).searchParams.get('cursor') ?? '')
        return HttpResponse.json({ asOfHeight: 2_570_008, totalCount: 1, value: [] })
      }),
    )
    await hyphen.blocksFrom('mainnet', { fromHeight: 2_569_000, asOfHeight: 2_570_008, limit: 3 })
    expect(decodeCursor(seen[0]!)).toEqual({ asOfHeight: 2_570_008, height: 2_569_001 })
  })
})

describe('hyphen client', () => {
  it('lists blocks as Page<T> stamped with the snapshot height', async () => {
    const out = await hyphen.blocks('mainnet', { limit: 20 })
    expect(out.source).toBe('hyphen')
    expect(out.height).toBe(out.data.asOfHeight)
    expect(out.data.items[0]?.blockHash).toMatch(/^[0-9a-f]{64}$/)
    expect(out.data.total).toBeGreaterThan(2_000_000)
  })

  it('block by hash carries cbTx and the chainlock tag', async () => {
    const out = await hyphen.block('mainnet', BLOCK)
    expect(out.data?.cbTx?.creditPoolBalance).toBeTypeOf('bigint')
    expect(out.data?.live?.tags?.chainlock).toBeTypeOf('boolean')
  })

  it('block by height is served from the height route', async () => {
    const out = await hyphen.block('mainnet', 2_570_003)
    expect(out.data?.blockHash).toBe(BLOCK)
  })

  it('unknown transactions resolve to Sourced<null>', async () => {
    server.use(
      http.get('*/x/hy/mainnet/tx/:id', () =>
        HttpResponse.json(
          { error: { code: 'NotFound', message: 'transaction not found' } },
          { status: 404 },
        ),
      ),
    )
    const out = await hyphen.tx('mainnet', 'ab'.repeat(32))
    expect(out.data).toBeNull()
  })

  it('address summary and history parse with bigint amounts', async () => {
    const summary = await hyphen.address('mainnet', ADDRESS)
    expect(summary.data?.balance).toBeTypeOf('bigint')
    const txs = await hyphen.addressTxs('mainnet', ADDRESS, { limit: 25 })
    expect(txs.data.items[0]?.direction).toMatch(/^(in|out)$/)
    expect(txs.data.items[0]?.netValue).toBeTypeOf('bigint')
  })

  it('rich list, metrics, mempool, network, proposals and validators parse', async () => {
    const rich = await hyphen.balances('mainnet', { limit: 25 })
    expect(rich.data.items[0]?.rank).toBe(1)
    expect(rich.data.includedSupply).toBeTypeOf('bigint')
    expect((await hyphen.metricsLatest('mainnet')).data.circulatingSupply).toBeTypeOf('bigint')
    expect(
      (await hyphen.metricsChart('mainnet', { blocks: 144, points: 48 })).data.value.length,
    ).toBe(48)
    expect((await hyphen.mempool('mainnet')).data.count).toBeTypeOf('number')
    expect((await hyphen.mempoolTxs('mainnet', { limit: 20 })).data.items).toBeInstanceOf(Array)
    expect((await hyphen.network('mainnet')).data.validators.evonode.total).toBeGreaterThan(0)
    expect(
      (await hyphen.proposals('mainnet', { limit: 20 })).data.items[0]?.paymentAmount,
    ).toBeTypeOf('bigint')
    expect((await hyphen.validators('mainnet', { limit: 25 })).data.items[0]?.proTxHash).toMatch(
      /^[0-9a-f]{64}$/,
    )
  })

  it('status records how far the index trails a reference tip', async () => {
    const out = await hyphen.status('testnet', undefined, 1_589_136)
    const min = Math.min(...Object.values(out.data.indices).map((i) => i.indexedHeight))
    expect(min).toBe(1_577_999)
    const h = healthRegistry.get('testnet', 'hyphen')
    expect(h.state).toBe('stale')
    expect(h.lag?.blocks).toBe(1_589_136 - 1_577_999)
    expect(h.lag?.detail).toMatch(/^indexed to block 1,577,999 \(\d+ days? behind\)$/)
  })

  it('status without a reference height leaves the probe lag in place', async () => {
    await hyphen.status('testnet', undefined, 1_589_136)
    await hyphen.status('testnet')
    expect(healthRegistry.get('testnet', 'hyphen').lag?.blocks).toBe(1_589_136 - 1_577_999)
  })

  it('status is ok when the index is within three blocks of the tip', async () => {
    const out = await hyphen.status('mainnet')
    const min = Math.min(...Object.values(out.data.indices).map((i) => i.indexedHeight))
    await hyphen.status('mainnet', undefined, min + 2)
    expect(healthRegistry.get('mainnet', 'hyphen').state).toBe('ok')
    await hyphen.status('mainnet', undefined, min + 4)
    expect(healthRegistry.get('mainnet', 'hyphen').state).toBe('stale')
  })

  it('search returns typed hits', async () => {
    const out = await hyphen.search('mainnet', ADDRESS)
    expect(out.data?.value[0]).toEqual({ type: 'address', address: ADDRESS })
  })

  it('rejects instead of throwing synchronously on a devnet', async () => {
    let promise: Promise<unknown> | undefined
    expect(() => {
      promise = hyphen.search('devnet-ruby', 'x')
    }).not.toThrow()
    const e = await promise?.catch((error: unknown) => error)
    expect(isSourceError(e) && e.kind).toBe('unavailable')
  })

  it('is unavailable on devnets', async () => {
    const e = await hyphen.status('devnet-ruby').catch((error: unknown) => error)
    expect(isSourceError(e) && e.kind).toBe('unavailable')
  })

  it('maps a Hyphen bad-request body onto the error message', async () => {
    server.use(
      http.get('*/x/hy/mainnet/blocks', () =>
        HttpResponse.json(
          { error: { code: 'BadRequest', message: 'cursor snapshot is ahead of current request' } },
          { status: 400 },
        ),
      ),
    )
    const e = await hyphen
      .blocks('mainnet', { cursor: cursorFromHeight(9e9, 1) })
      .catch((error: unknown) => error)
    expect(isSourceError(e) && e.kind).toBe('http')
    expect(isSourceError(e) && e.status).toBe(400)
    expect(String((e as Error).message)).toContain('cursor snapshot is ahead')
  })
})

describe('readNdjson', () => {
  const chain = (h: number) =>
    JSON.stringify({
      type: 'chain_lock',
      ts: 1_700_000_000,
      payload: { blockHash: 'ab'.repeat(32), blockHeight: h },
    })

  it('splits events across chunk boundaries', async () => {
    const line = chain(7)
    const events = await collect(
      readNdjson(bytes(line.slice(0, 20), line.slice(20) + '\n', chain(8) + '\n')),
    )
    expect(events.map((e) => e.type)).toEqual(['chain_lock', 'chain_lock'])
    expect(events[0]).toMatchObject({ payload: { blockHeight: 7 }, ts: 1_700_000_000_000 })
  })

  it('handles several events in one chunk, blank lines and CRLF', async () => {
    const events = await collect(readNdjson(bytes(`${chain(1)}\r\n\n${chain(2)}\n\n`)))
    expect(events).toHaveLength(2)
  })

  it('parses a final line without a trailing newline', async () => {
    expect(await collect(readNdjson(bytes(chain(1) + '\n' + chain(2))))).toHaveLength(2)
  })

  it('keeps a multi-byte character that is split across chunks', async () => {
    const line =
      JSON.stringify({ type: 'governance_object', ts: 1, payload: { name: 'é☃' } }) + '\n'
    const raw = new TextEncoder().encode(line)
    const cut = line.indexOf('é') + 1
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(raw.slice(0, cut))
        c.enqueue(raw.slice(cut))
        c.close()
      },
    })
    const [event] = await collect(readNdjson(stream))
    expect(event).toMatchObject({ type: 'governance_object', payload: { name: 'é☃' } })
  })

  it('skips event types it does not know and heartbeats pass through', async () => {
    const events = await collect(
      readNdjson(bytes('{"type":"future_thing","ts":1,"payload":{}}\n{"type":"heartbeat"}\n')),
    )
    expect(events.map((e) => e.type)).toEqual(['heartbeat'])
  })

  it('skips a line that is not JSON and keeps reading', async () => {
    const events = await collect(readNdjson(bytes(`{oops\n${chain(1)}\n`)))
    expect(events).toHaveLength(1)
  })

  it('drops an unterminated tail that is cut mid-line', async () => {
    const events = await collect(readNdjson(bytes(`${chain(1)}\n${chain(2).slice(0, 30)}`)))
    expect(events).toHaveLength(1)
  })

  it('does not parse a buffered partial line after abort', async () => {
    const controller = new AbortController()
    const enc = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(enc.encode(`${chain(1)}\n${chain(2).slice(0, 30)}`))
      },
    })
    const seen: string[] = []
    for await (const ev of readNdjson(stream, controller.signal)) {
      seen.push(ev.type)
      controller.abort()
    }
    expect(seen).toEqual(['chain_lock'])
  })

  it('ends quietly when the signal aborts and cancels the source', async () => {
    let cancelled = false
    const controller = new AbortController()
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode(chain(1) + '\n'))
      },
      cancel() {
        cancelled = true
      },
    })
    const seen: number[] = []
    for await (const ev of readNdjson(stream, controller.signal)) {
      if (ev.type === 'chain_lock') seen.push(ev.payload.blockHeight)
      controller.abort()
    }
    expect(seen).toEqual([1])
    expect(cancelled).toBe(true)
  })

  it('replays a recorded transcript', async () => {
    const lines = await streamLines('hyphen', 'testnet')
    const events = await collect(readNdjson(bytes(lines.join('\n') + '\n')))
    expect(events.length).toBe(lines.length)
  })
})

describe('openHyphenStream', () => {
  it('opens the stream route and yields recorded events', async () => {
    const stream = await openHyphenStream('mainnet')
    const events = await collect(stream)
    expect(events.length).toBeGreaterThan(0)
    expect(healthRegistry.get('mainnet', 'hyphen').state).toBe('ok')
  })

  it('reports a refused connection as a network error', async () => {
    server.use(http.get('*/x/hy/mainnet/stream', () => HttpResponse.error()))
    const e = await openHyphenStream('mainnet').catch((error: unknown) => error)
    expect(isSourceError(e) && e.kind).toBe('network')
  })

  it('reports a non-2xx answer as http', async () => {
    server.use(http.get('*/x/hy/mainnet/stream', () => new HttpResponse(null, { status: 502 })))
    const e = await openHyphenStream('mainnet').catch((error: unknown) => error)
    expect(isSourceError(e) && e.kind).toBe('http')
    expect(isSourceError(e) && e.status).toBe(502)
  })
})
