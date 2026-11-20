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
  el.textContent = JSON.stringify(data)
  document.body.append(el)
}

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
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  enableEarlyAnswers(false)
  writeSourceMode('all')
})

describe('first data the edge inlined', () => {
  it("answers the tx page's indexed-first read without asking Hyphen again, labelled as today", async () => {
    inline({ reads })
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
    expect(fetchMock).not.toHaveBeenCalled()
    expect(document.getElementById(FIRST_DATA_ELEMENT_ID)).toBeNull()
  })

  it("serves the probe's status read too, and reads what was not inlined from the network", async () => {
    inline({ reads: { '/x/hy/mainnet/status': reads['/x/hy/mainnet/status'] } })
    const status = await hyphen.status('mainnet', undefined, undefined, { probe: true })
    expect(status.data.blockHeight).toBe(2571151)
    expect(status.height).toBeDefined()
    expect(fetchMock).not.toHaveBeenCalled()
    await hyphen.rawTx('mainnet', TXID)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reads the network once the inlined answers are older than the edge would keep them', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    inline({ reads })
    await hyphen.tx('mainnet', TXID)
    expect(fetchMock).not.toHaveBeenCalled()
    vi.setSystemTime(Date.now() + FIRST_DATA_MAX_AGE_MS + 1)
    await hyphen.tx('mainnet', TXID)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('is never used in Decentralized only mode, and ignores anything but pass-through paths', async () => {
    inline({ reads: { ...reads, 'https://evil.example/x': {} } })
    writeSourceMode('decentralized')
    await expect(hyphen.tx('mainnet', TXID)).rejects.toMatchObject({ kind: 'disabled-by-mode' })
    writeSourceMode('all')
    await hyphen.tx('testnet', TXID)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('is left to production: fixture builds and page tests read what they recorded', async () => {
    inline({ reads })
    enableEarlyAnswers(false)
    await hyphen.tx('mainnet', TXID)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reads the network when the inlined element is not JSON', async () => {
    const el = document.createElement('script')
    el.type = 'application/json'
    el.id = FIRST_DATA_ELEMENT_ID
    el.textContent = '{not json'
    document.body.append(el)
    await hyphen.tx('mainnet', TXID)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
