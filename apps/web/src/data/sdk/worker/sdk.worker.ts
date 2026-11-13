import * as Comlink from 'comlink'
import type { SdkWorkerApi, WireError, WireResult } from '../methods'
import { createSdkWorkerApi } from './api'
import { createFetchGuard } from './fetch-guard'
import { decodeWithWasm } from './decode'
import { createEvoSdk } from './sdk-factory'

const guard = createFetchGuard(globalThis.fetch.bind(globalThis))
globalThis.fetch = guard.fetch

const api = createSdkWorkerApi({ createSdk: createEvoSdk, decode: decodeWithWasm })

function proofBuffers(r: WireResult<unknown> | WireError | { ok: true }): ArrayBuffer[] {
  const proof = 'proof' in r ? r.proof : undefined
  if (!proof) return []
  return [proof.grovedbProof, proof.quorumHash, proof.signature, proof.blockIdHash].map(
    (b) => b.buffer as ArrayBuffer,
  )
}

/** Proof bytes move to the main thread instead of being copied (§3.2). */
const exposed: SdkWorkerApi = {
  async connect(cfg) {
    const result = await api.connect(cfg)
    return { ...result, requests: guard.drain() }
  },
  async call(net, method, args) {
    const result = { ...(await api.call(net, method, args)), requests: guard.drain() }
    return Comlink.transfer(result, proofBuffers(result))
  },
  decode: (kind, bytes, opts) => api.decode(kind, bytes, opts),
}

Comlink.expose(exposed)
