import { describe, expect, it, vi } from 'vitest'
import { createCoreDecoder, type WasmCore } from './decode'

describe('createCoreDecoder', () => {
  it('tries the wasm again after a warm-up that failed', async () => {
    const wasm: WasmCore = {
      decodeBlock: () => Promise.reject(new Error('unused')),
      decodeTx: () => Promise.reject(new Error('decoded')),
    }
    const load = vi
      .fn<() => Promise<WasmCore>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(wasm)
    const decoder = createCoreDecoder(load)
    decoder.warm()
    await Promise.resolve()
    await Promise.resolve()
    await expect(decoder.tx(new Uint8Array(1), 'mainnet')).rejects.toMatchObject({
      kind: 'invalid-response',
    })
    expect(load).toHaveBeenCalledTimes(2)
  })
})
