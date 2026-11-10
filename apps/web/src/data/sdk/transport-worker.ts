import * as Comlink from 'comlink'
import { trustedWorkerUrl } from '../trusted-worker'
import type { SdkTransport } from './client'
import workerUrl from './worker/sdk.worker.ts?worker&url'

/** The SDK in a module worker; the wasm and the SDK package load there, never on the main thread. */
export function createWorkerTransport(): SdkTransport {
  const worker = new Worker(trustedWorkerUrl(new URL(workerUrl, location.href)), { type: 'module' })
  return Comlink.wrap<SdkTransport>(worker)
}
