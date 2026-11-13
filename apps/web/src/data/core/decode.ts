import * as Comlink from 'comlink'
import type * as Wasm from '@radar/core-decode'
import { SourceError } from '../errors'
import { trustedWorkerUrl } from '../trusted-worker'
import workerUrl from './decode.worker.ts?worker&url'
import type { NetworkId } from '@/lib/network'
import { HEADER_BYTES, headerAsEmptyBlock } from '@/lib/core/header'
import { parseMnListDiff } from './mn-list-decode'
import { bip34Height, blockHeightOf, mapBlock, mapTx, NO_HEIGHT, wasmNetwork } from './convert'
import type { CoreDecoder, DapiMnListDiff, DecodedBlock, DecodedIsLock, DecodedTx } from './types'

/** The two wasm exports, in a worker (as a Comlink proxy) or in this thread. */
export interface WasmCore {
  decodeBlock(
    bytes: Uint8Array,
    network: Wasm.Network,
  ): Wasm.DecodedBlock | Promise<Wasm.DecodedBlock>
  decodeTx(bytes: Uint8Array, network: Wasm.Network): Wasm.DecodedTx | Promise<Wasm.DecodedTx>
}

function invalid(what: string, cause: unknown): SourceError {
  return new SourceError({
    source: 'local',
    kind: 'invalid-response',
    message: `The Core decoder could not read this ${what}`,
    cause,
  })
}

/** Core decoder over a wasm loader. Everything the wasm returns is mapped to the contract types here, on the calling thread. */
export function createCoreDecoder(load: () => Promise<WasmCore>): CoreDecoder & {
  /** X11 hash of an 80-byte header. */
  headerHash(header: Uint8Array, net: NetworkId): Promise<string>
} {
  let loaded: Promise<WasmCore> | undefined
  const wasm = () => (loaded ??= load())

  return {
    async block(bytes, net, expectHeight): Promise<DecodedBlock> {
      const core = await wasm()
      let raw: Wasm.DecodedBlock
      try {
        raw = await core.decodeBlock(bytes, wasmNetwork(net))
      } catch (cause) {
        throw invalid('block', cause)
      }
      if (expectHeight !== undefined && expectHeight < bip34Height(net)) {
        return mapBlock(raw, expectHeight)
      }
      const height = blockHeightOf(raw)
      if (height === undefined) throw invalid('block', new Error(NO_HEIGHT))
      return mapBlock(raw, height)
    },
    async tx(bytes, net): Promise<DecodedTx> {
      const core = await wasm()
      try {
        return mapTx(await core.decodeTx(bytes, wasmNetwork(net)))
      } catch (cause) {
        throw invalid('transaction', cause)
      }
    },
    async headerHash(header, net) {
      if (header.length !== HEADER_BYTES) throw invalid('header', new Error('not 80 bytes'))
      const core = await wasm()
      try {
        return (await core.decodeBlock(headerAsEmptyBlock(header), wasmNetwork(net))).hash
      } catch (cause) {
        throw invalid('header', cause)
      }
    },
    mnListDiff(bytes): Promise<DapiMnListDiff> {
      return Promise.resolve().then(() => parseMnListDiff(bytes).diff)
    },
    isLock(bytes): Promise<DecodedIsLock> {
      return Promise.resolve().then(() => parseIsLock(bytes))
    },
  }
}

const IS_LOCK_FIXED = 32 + 32 + 96

function parseIsLock(bytes: Uint8Array): DecodedIsLock {
  const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  const rev = (b: Uint8Array) => hex(Uint8Array.from(b).reverse())
  try {
    let i = 1 // version byte; version 1 locks carry a cycle hash
    const first = bytes[i++]
    let count = first!
    if (first === 0xfd) {
      count = bytes[i]! | (bytes[i + 1]! << 8)
      i += 2
    }
    if (bytes.length !== i + count * 36 + IS_LOCK_FIXED) throw new Error('unexpected length')
    const inputs = []
    for (let n = 0; n < count; n++, i += 36) {
      const view = new DataView(bytes.buffer, bytes.byteOffset + i + 32, 4)
      inputs.push({ txid: rev(bytes.subarray(i, i + 32)), vout: view.getUint32(0, true) })
    }
    return {
      txid: rev(bytes.subarray(i, i + 32)),
      inputs,
      cycleHash: rev(bytes.subarray(i + 32, i + 64)),
      signature: hex(bytes.subarray(i + 64)),
    }
  } catch (cause) {
    throw invalid('InstantSend lock', cause)
  }
}

/** The decoder in a module worker: the wasm module loads on first use and never touches the main thread. */
function workerLoader(): Promise<WasmCore> {
  const worker = new Worker(trustedWorkerUrl(new URL(workerUrl, location.href)), {
    type: 'module',
  })
  return Promise.resolve(Comlink.wrap<WasmCore>(worker))
}

/** In this thread, for tests and environments without module workers. */
async function inlineLoader(): Promise<WasmCore> {
  const [mod, wasmUrl] = await Promise.all([
    import('@radar/core-decode'),
    import('@radar/core-decode/core_decode_bg.wasm?url'),
  ])
  await mod.default({ module_or_path: wasmUrl.default })
  return mod
}

export const coreDecoder = createCoreDecoder(
  typeof Worker === 'undefined' ? inlineLoader : workerLoader,
)
