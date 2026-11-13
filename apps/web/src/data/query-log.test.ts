import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QUERY_LOG_SIZE, queryLog } from './query-log'

const entry = (what: string) => ({
  net: 'mainnet' as const,
  source: 'radar' as const,
  what,
  ok: true,
  tookMs: 12,
})

describe('query log', () => {
  beforeEach(() => queryLog.clear())

  it('keeps entries in order with growing ids', () => {
    queryLog.push(entry('GET /a'))
    queryLog.push({ ...entry('GET /b'), ok: false, kind: 'timeout' })
    const [a, b] = queryLog.snapshot()
    expect(a?.what).toBe('GET /a')
    expect(b).toMatchObject({ what: 'GET /b', ok: false, kind: 'timeout' })
    expect(b!.id).toBeGreaterThan(a!.id)
  })

  it('keeps only the newest hundred', () => {
    for (let i = 0; i < QUERY_LOG_SIZE + 5; i++) queryLog.push(entry(`GET /${i}`))
    const rows = queryLog.snapshot()
    expect(rows).toHaveLength(QUERY_LOG_SIZE)
    expect(rows[0]?.what).toBe('GET /5')
    expect(rows.at(-1)?.what).toBe(`GET /${QUERY_LOG_SIZE + 4}`)
  })

  it('hands out a stable snapshot until something changes', () => {
    queryLog.push(entry('GET /a'))
    expect(queryLog.snapshot()).toBe(queryLog.snapshot())
  })

  it('tells subscribers about pushes and clears, and stops after unsubscribe', () => {
    const cb = vi.fn()
    const off = queryLog.subscribe(cb)
    queryLog.push(entry('GET /a'))
    queryLog.clear()
    expect(cb).toHaveBeenCalledTimes(2)
    off()
    queryLog.push(entry('GET /b'))
    expect(cb).toHaveBeenCalledTimes(2)
  })

  it('does not wake subscribers when clearing an empty log', () => {
    const cb = vi.fn()
    queryLog.subscribe(cb)
    queryLog.clear()
    expect(cb).not.toHaveBeenCalled()
  })
})
