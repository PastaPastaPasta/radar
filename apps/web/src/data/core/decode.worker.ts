import * as Comlink from 'comlink'
import init, { decodeBlock, decodeTx } from '@radar/core-decode'
import wasmUrl from '@radar/core-decode/core_decode_bg.wasm?url'

const ready = init({ module_or_path: wasmUrl })

Comlink.expose({
  async decodeBlock(bytes: Uint8Array, network: Parameters<typeof decodeBlock>[1]) {
    await ready
    return decodeBlock(bytes, network)
  },
  async decodeTx(bytes: Uint8Array, network: Parameters<typeof decodeTx>[1]) {
    await ready
    return decodeTx(bytes, network)
  },
})
