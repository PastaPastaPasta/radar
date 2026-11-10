import * as Comlink from 'comlink'
import type { SdkWorkerApi, WireError, WireResult } from '../methods'
import { createSdkWorkerApi } from './api'
import { createEvoSdk, decodeWithWasm } from './sdk-factory'

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
  connect: (cfg) => api.connect(cfg),
  async call(net, method, args) {
    const result = await api.call(net, method, args)
    return Comlink.transfer(result, proofBuffers(result))
  },
  decode: (kind, bytes) => api.decode(kind, bytes),
}

Comlink.expose(exposed)
