import * as Comlink from 'comlink'
import { trustedWorkerUrl } from '../trusted-worker'
import type { SdkTransport } from './client'
import workerUrl from './worker/sdk.worker.ts?worker&url'

/**
 * The SDK in a module worker; the wasm and the SDK package load there, never on the main thread. A worker that fails
 * to start (a stale tab whose chunk is gone) or dies rejects every call, instead of leaving them waiting.
 */
export function createWorkerTransport(): SdkTransport {
  const worker = new Worker(trustedWorkerUrl(new URL(workerUrl, location.href)), { type: 'module' })
  const dead = new Promise<never>((_, reject) => {
    const fail = (e: Event) =>
      reject(new Error((e as ErrorEvent).message || 'The Platform SDK worker failed'))
    worker.addEventListener('error', fail, { once: true })
    worker.addEventListener('messageerror', fail, { once: true })
  })
  dead.catch(() => undefined)
  const proxy = Comlink.wrap<SdkTransport>(worker)
  const alive = <T>(p: Promise<T>): Promise<T> => Promise.race([p, dead])
  return {
    connect: (cfg) => alive(proxy.connect(cfg) as ReturnType<SdkTransport['connect']>),
    call: (net, method, args) =>
      alive(proxy.call(net, method, args) as ReturnType<SdkTransport['call']>),
    decode: (kind, bytes) => alive(proxy.decode(kind, bytes) as ReturnType<SdkTransport['decode']>),
    dispose: () => worker.terminate(),
  }
}
