import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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

/** A Core client over the recorded DAPI exchanges, for tests that need real decoded blocks and transactions. */
export function fixtureCore() {
  const transport = new FixtureDapiTransport()
  const core = createCoreClient({
    transport: () => transport,
    decoder,
    hyphen,
    health: { get: () => ({ state: 'ok' }) as never },
    now: Date.now,
  })
  return { core, transport }
}
