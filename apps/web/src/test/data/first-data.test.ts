import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCoreClient } from '@/data/core/client'
import { createCoreDecoder } from '@/data/core/decode'
import { enableEarlyAnswers } from '@/data/early'
import {
  FIRST_DATA_ELEMENT_ID,
  FIRST_DATA_MAX_AGE_MS,
  resetFirstDataForTests,
} from '@/data/first-data'
import { healthRegistry, resetHealthRegistry } from '@/data/health'
import { hyphen } from '@/data/hyphen/client'
import { writeSourceMode } from '@/lib/source-mode'
import { FixtureDapiTransport } from '@/test/msw/dapi-transport'

const wasmPath = resolve(process.cwd(), '../../packages/core-decode/dist/core_decode_bg.wasm')
const decoder = createCoreDecoder(async () => {
  const wasm = await import('@radar/core-decode')
  wasm.initSync({ module: readFileSync(wasmPath) })
  return wasm
})

const HY = resolve(process.cwd(), 'src/test/fixtures/http/hyphen/mainnet')
const body = (file: string) =>
  (JSON.parse(readFileSync(resolve(HY, file), 'utf8')) as { body: Record<string, unknown> }).body

const TXID = '8acce06e01135b73f1acc26c8cb1084917e9bcf4a83ef1d1068df96a7c427a90'
const detail = body(`tx__${TXID}.json`)
const BLOCK_HEIGHT = detail.blockHeight as number
const reads = {
  [`/x/hy/mainnet/rawtx/${TXID}`]: body(`rawtx__${TXID}.json`),
  [`/x/hy/mainnet/tx/${TXID}`]: detail,
  [`/x/hy/mainnet/block/${BLOCK_HEIGHT}`]: body(`block__${BLOCK_HEIGHT}.json`),
  '/x/hy/mainnet/status': body('status.json'),
}

function inline(data: unknown) {
  const el = document.createElement('script')
  el.type = 'application/json'
  el.id = FIRST_DATA_ELEMENT_ID
  el.textContent = typeof data === 'string' ? data : JSON.stringify(data)
  document.body.append(el)
}

/** The page as the edge builds it: when it built it, and each read with when the edge read it from Hyphen. */
const page = (at: number, fetchedAt = at - 5_000, which: Record<string, unknown> = reads) => ({
  at,
  reads: Object.fromEntries(Object.entries(which).map(([k, body]) => [k, { body, fetchedAt }])),
})

const fetchMock = vi.fn((url: string) => {
  const found = reads[new URL(url).pathname.replace('/testnet/', '/mainnet/')]
  return Promise.resolve(Response.json(found ?? {}, { status: found ? 200 : 404 }))
})

beforeEach(() => {
  resetFirstDataForTests()
  document.getElementById(FIRST_DATA_ELEMENT_ID)?.remove()
  fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
  writeSourceMode('all')
  enableEarlyAnswers()
  resetHealthRegistry()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  enableEarlyAnswers(false)
  writeSourceMode('all')
})

describe('first data the edge inlined', () => {
  it("answers the tx page's indexed-first read without asking Hyphen again, labelled and timed as the edge read it", async () => {
    const at = Date.now()
    inline(page(at, at - 5_000))
    const core = createCoreClient({
      transport: () => new FixtureDapiTransport(),
      decoder,
      hyphen,
      health: { get: () => ({ state: 'ok' }) as never },
      now: Date.now,
    })
    const tx = await core.indexedTx('mainnet', TXID)
    expect(tx?.source).toBe('hyphen')
    expect(tx?.fallback).toBe('dapi-cold')
    expect(tx?.proved).toBe(false)
    expect(tx?.data.txid).toBe(TXID)
    expect(tx?.data.height).toBe(BLOCK_HEIGHT)
    expect(tx?.fetchedAt).toBe(at - 5_000)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(document.getElementById(FIRST_DATA_ELEMENT_ID)).toBeNull()
  })

  it('is no round trip to Hyphen, so it tells the health registry nothing', async () => {
    inline(page(Date.now()))
    await hyphen.tx('mainnet', TXID)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(healthRegistry.get('mainnet', 'hyphen').lastOkAt).toBeUndefined()
  })

  it("leaves Hyphen's lag to live reads: an inlined status measures nothing", async () => {
    inline(page(Date.now()))
    const lag = vi.spyOn(healthRegistry, 'setLag')
    const inlinedStatus = await hyphen.status('mainnet', undefined, 99_999_999)
    expect(inlinedStatus.inlined).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(lag).not.toHaveBeenCalled()
    const live = await hyphen.status('mainnet', undefined, 99_999_999)
    expect(live.inlined).toBeUndefined()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(lag).toHaveBeenCalled()
    lag.mockRestore()
  })

  it('never answers the probe, whose job is to measure Hyphen itself', async () => {
    inline(page(Date.now()))
    await hyphen.status('mainnet', undefined, undefined, { probe: true })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await hyphen.status('mainnet')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('answers each read once, so a poll in the first seconds asks Hyphen', async () => {
    inline(page(Date.now()))
    await hyphen.tx('mainnet', TXID)
    expect(fetchMock).not.toHaveBeenCalled()
    await hyphen.tx('mainnet', TXID)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reads the network once the page is older than the window, counted from when the edge built it', async () => {
    inline(page(Date.now() - FIRST_DATA_MAX_AGE_MS - 1))
    await hyphen.tx('mainnet', TXID)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    resetFirstDataForTests()
    vi.useFakeTimers({ toFake: ['Date'] })
    inline(page(Date.now()))
    vi.setSystemTime(Date.now() + FIRST_DATA_MAX_AGE_MS + 1)
    await hyphen.rawTx('mainnet', TXID)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('is never used in Decentralized only mode, and ignores anything but pass-through paths', async () => {
    inline(page(Date.now(), Date.now(), { ...reads, 'https://evil.example/x': {} }))
    writeSourceMode('decentralized')
    await expect(hyphen.tx('mainnet', TXID)).rejects.toMatchObject({ kind: 'disabled-by-mode' })
    writeSourceMode('all')
    await hyphen.tx('testnet', TXID)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('is left to production: fixture builds and page tests read what they recorded', async () => {
    inline(page(Date.now()))
    enableEarlyAnswers(false)
    await hyphen.tx('mainnet', TXID)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reads the network when the element is not JSON or does not say when the edge built it', async () => {
    inline('{not json')
    await hyphen.tx('mainnet', TXID)
    resetFirstDataForTests()
    document.getElementById(FIRST_DATA_ELEMENT_ID)?.remove()
    inline({ reads: page(Date.now()).reads })
    await hyphen.tx('mainnet', TXID)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
