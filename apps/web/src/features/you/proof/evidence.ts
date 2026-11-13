import type { ProofRecord } from '@/data/sdk/proof-store'
import { bytesToHex } from '@/lib/hex'

/** Plain JSON for anything a call's arguments may hold: bigints as text, bytes as hex, maps as objects. */
export function jsonSafe(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof Uint8Array) return bytesToHex(value)
  if (value instanceof Map) {
    return Object.fromEntries([...value].map(([k, v]) => [String(k), jsonSafe(v)]))
  }
  if (Array.isArray(value)) return value.map(jsonSafe)
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, jsonSafe(v)]))
  }
  return value
}

export interface EvidenceFile {
  format: 'radar-proof-evidence'
  version: 1
  exportedAt: string
  app: string
  /** What every record in `proofs` has in common. */
  note: string
  proofs: ProofEvidence[]
}

export interface ProofEvidence {
  id: string
  network: string
  method: string
  args: unknown
  recordedAt: string
  node: string | null
  platformHeight: number
  coreChainLockedHeight: number
  epoch: number
  platformTime: string
  protocolVersion: number
  chainId: string
  quorum: { type: number; hash: string; round: number }
  signature: string
  blockIdHash: string
  grovedbProof: { bytes: number; hex: string }
  verification: { result: 'verified'; by: string }
}

const isoOf = (ms: number): string => new Date(ms).toISOString()

export function evidenceOf(record: ProofRecord): ProofEvidence {
  return {
    id: record.id,
    network: record.net,
    method: record.method,
    args: jsonSafe(record.args),
    recordedAt: isoOf(record.recordedAt),
    node: record.node ?? null,
    platformHeight: record.meta.height,
    coreChainLockedHeight: record.meta.coreChainLockedHeight,
    epoch: record.meta.epoch,
    platformTime: isoOf(record.meta.timeMs),
    protocolVersion: record.meta.protocolVersion,
    chainId: record.meta.chainId,
    quorum: {
      type: record.proof.quorumType,
      hash: bytesToHex(record.proof.quorumHash),
      round: record.proof.round,
    },
    signature: bytesToHex(record.proof.signature),
    blockIdHash: bytesToHex(record.proof.blockIdHash),
    grovedbProof: {
      bytes: record.proof.grovedbProof.length,
      hex: bytesToHex(record.proof.grovedbProof),
    },
    verification: { result: 'verified', by: 'Dash Platform SDK, against the trusted quorum keys' },
  }
}

/** The file for one figure's proof or for every proof the browser holds. */
export function evidenceFile(
  records: readonly ProofRecord[],
  now: number,
  app: string,
): EvidenceFile {
  return {
    format: 'radar-proof-evidence',
    version: 1,
    exportedAt: isoOf(now),
    app,
    note: 'Every proof here passed the SDK’s check when it was received; Radar keeps no proof that failed. Hex strings are lower-case.',
    proofs: records.map(evidenceOf),
  }
}

export const evidenceText = (file: EvidenceFile): string => JSON.stringify(file, null, 2)

/** Hands the text to the browser as a file download. */
export function downloadText(name: string, text: string, type = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => {
    URL.revokeObjectURL(url)
  }, 0)
}

export const evidenceName = (scope: string, now: number): string =>
  `radar-proof-${scope}-${isoOf(now).replace(/[:.]/g, '-')}.json`
