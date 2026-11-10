import rawInit from '@dashevo/wasm-sdk/raw';
import wasmUrl from '@dashevo/wasm-sdk/raw/wasm_sdk_bg.wasm?url';

export * from '@dashevo/wasm-sdk/raw';
let p: Promise<unknown> | undefined;
export default function init() {
  return (p ??= rawInit({ module_or_path: wasmUrl }).then((exports: any) => {
    (globalThis as any).__wasmMemory = exports.memory;
    return exports;
  }));
}
