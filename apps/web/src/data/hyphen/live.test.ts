import { describe, expect, it } from 'vitest'
import { mergeEvents, newMempoolTxs } from './live'
import type { HyStreamEvent } from './schemas'

const HASH = (n: number) => n.toString(16).padStart(64, '0')
const noWait = () => Promise.resolve()

async function collect<T>(source: AsyncIterable<T>, limit = 100): Promise<T[]> {
  const out: T[] = []
  for await (const item of source) {
    out.push(item)
    if (out.length >= limit) break
  }
  return out
}

describe('newMempoolTxs @IN-06', () => {
  it('says nothing about what was already there and reports each new transaction once', async () => {
    const looks = [
      [HASH(2), HASH(1)],
      [HASH(3), HASH(2), HASH(1)],
      [HASH(3), HASH(2), HASH(1)],
    ]
    const controller = new AbortController()
    let n = 0
    const events = await collect(
      newMempoolTxs(
        (): Promise<string[]> => {
          const ids = looks[n++]
          if (!ids) {
            controller.abort()
            return Promise.resolve([])
          }
          return Promise.resolve(ids)
        },
        controller.signal,
        0,
        noWait,
      ),
    )
    expect(events.map((e) => (e.type === 'mempool_tx' ? e.payload.txid : undefined))).toEqual([
      HASH(3),
    ])
  })

  it('keeps going after a failed look', async () => {
    const controller = new AbortController()
    let n = 0
    const events = await collect(
      newMempoolTxs(
        (): Promise<string[]> => {
          n++
          if (n === 1) return Promise.resolve([HASH(1)])
          if (n === 2) return Promise.reject(new Error('down'))
          if (n === 3) return Promise.resolve([HASH(2), HASH(1)])
          controller.abort()
          return Promise.resolve([])
        },
        controller.signal,
        0,
        noWait,
      ),
    )
    expect(events).toHaveLength(1)
  })
})

describe('mergeEvents @IN-06', () => {
  it('interleaves both sources and ends with the stream', async () => {
    const controller = new AbortController()
    async function* stream(): AsyncGenerator<HyStreamEvent> {
      yield { type: 'heartbeat', ts: 1 }
      await new Promise((r) => setTimeout(r, 10))
    }
    async function* extra(): AsyncGenerator<HyStreamEvent> {
      yield { type: 'mempool_tx', ts: 2, payload: { txid: HASH(9) } }
      await new Promise((r) => setTimeout(r, 1000))
    }
    const events = await collect(mergeEvents(stream(), extra(), controller))
    expect(events.map((e) => e.type).sort()).toEqual(['heartbeat', 'mempool_tx'])
    expect(controller.signal.aborted).toBe(true)
  })

  it('passes on a failure of the stream', async () => {
    async function* stream(): AsyncGenerator<HyStreamEvent> {
      await Promise.resolve()
      throw new Error('cut')
      yield { type: 'heartbeat', ts: 1 }
    }
    async function* extra(): AsyncGenerator<HyStreamEvent> {
      await new Promise((r) => setTimeout(r, 1000))
      yield { type: 'heartbeat', ts: 1 }
    }
    await expect(collect(mergeEvents(stream(), extra(), new AbortController()))).rejects.toThrow(
      'cut',
    )
  })
})
