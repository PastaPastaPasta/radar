import rawInit from '@dashevo/wasm-sdk/raw'
import wasmUrl from '@dashevo/wasm-sdk/raw/wasm_sdk_bg.wasm?url'

export * from '@dashevo/wasm-sdk/raw'

let initialised: Promise<unknown> | undefined

/** Stands in for `@dashevo/wasm-sdk/compressed`: same exports, but the wasm is fetched as a separate file. */
export default function init(): Promise<unknown> {
  return (initialised ??= rawInit({ module_or_path: wasmUrl }))
}
