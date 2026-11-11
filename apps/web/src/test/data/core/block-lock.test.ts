import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createCoreClient } from '@/data/core/client'
import { createCoreDecoder } from '@/data/core/decode'
import { hyphen } from '@/data/hyphen/client'
import { FixtureDapiTransport } from '@/test/msw/dapi-transport'

const wasmPath = resolve(process.cwd(), '../../packages/core-decode/dist/core_decode_bg.wasm')
const decoder = createCoreDecoder(async () => {
  const wasm = await import('@radar/core-decode')
  wasm.initSync({ module: readFileSync(wasmPath) })
  return wasm
})

describe('block() @IN-03', () => {
  it('asks for the ChainLock beside the block, not after it', async () => {
    const transport = new FixtureDapiTransport()
    const core = createCoreClient({
      transport: () => transport,
      decoder,
      hyphen,
      health: { get: () => ({ state: 'ok' }) as never },
      now: Date.now,
    })
    const block = await core.block('mainnet', { height: 2570085 })
    expect(block.data?.height).toBe(2570085)
    const methods = transport.calls.map((c) => c.method)
    const lock = methods.indexOf('subscribeToBlockHeadersWithChainLocks')
    expect(lock).toBeGreaterThanOrEqual(0)
    expect(lock).toBeLessThan(methods.indexOf('getBlock'))
  })
})
