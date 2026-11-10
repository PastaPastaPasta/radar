import type { NetworkId } from '@/lib/network'

/**
 * One recorded DAPI exchange, found by `<net>/<method>/<sha256(request bytes)>`.
 * Messages are base64 protobuf. A stream lists every message the recording saw; `ended` says
 * whether the server closed it (header ranges) or the recorder stopped it (live follow).
 */
export interface DapiFixture {
  request: string
  recordedAt: string
  node: string
  response?: string
  messages?: string[]
  ended?: boolean
  /** The recorded call failed: `status` is the gRPC code (5 NOT_FOUND, 3 INVALID_ARGUMENT, …). */
  error?: { kind: string; status?: number; message: string }
}

export interface DapiManifestEntry {
  id: string
  purpose: string
  /** Façade call that records and replays this entity, e.g. `tx("…")`. */
  call: string
  height?: number
  txid?: string
  hash?: string
  tags: string[]
}

export interface DapiManifest {
  net: string
  recordedAt: string
  /** Chain tip when recording started. */
  tip: { height: number; hash: string }
  entries: DapiManifestEntry[]
  /** Types or kinds that could not be recorded on this network, with the reason. */
  gaps: { id: string; reason: string }[]
}

const files = import.meta.glob<DapiFixture>('./dapi/*/*/*.json', { import: 'default' })
const manifests = import.meta.glob<DapiManifest>('./dapi/*/manifest.json', { import: 'default' })

export async function loadDapiFixture(
  net: NetworkId,
  method: string,
  requestHash: string,
): Promise<DapiFixture | null> {
  const load = files[`./dapi/${net}/${method}/${requestHash}.json`]
  return load ? load() : null
}

export async function loadDapiManifest(net: NetworkId): Promise<DapiManifest> {
  const load = manifests[`./dapi/${net}/manifest.json`]
  if (!load) throw new Error(`No DAPI fixture manifest for ${net}`)
  return load()
}
