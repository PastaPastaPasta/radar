import type { SourceStamp } from '@/data/envelope'
import type { EntityKind } from '../types'

export const NOW = Date.now()

export function stamp(
  source: SourceStamp['source'],
  ageMs: number,
  extra: Partial<SourceStamp> = {},
): SourceStamp {
  return { source, asOf: NOW - ageMs, fetchedAt: NOW - ageMs, proved: false, ...extra }
}

export const STAMPS = {
  proof: stamp('sdk', 4_000, {
    proved: true,
    proof: {
      id: 'kit-proof',
      method: 'getIdentityWithProofInfo',
      platformHeight: 468_952,
      coreChainLockedHeight: 2_569_990,
      epoch: 88,
      timeMs: NOW - 4_000,
      protocolVersion: 12,
      chainId: 'dash-1',
      quorumType: 106,
      quorumHash: '00'.repeat(32),
      round: 0,
      proofBytes: 2_410,
    },
  }),
  notProved: stamp('sdk', 4_000),
  sdkCold: stamp('pe', 3_000, { fallback: 'sdk-cold' }),
  dapi: stamp('dapi', 2_000, { node: '45.32.107.227:1443' }),
  pe: stamp('pe', 12_000),
  radar: stamp('radar', 13 * 60_000),
  hyphen: stamp('hyphen', 30_000),
  hyphenStale: stamp('hyphen', 6 * 60_000),
  hyphenBusy: stamp('hyphen', 30_000, { fallback: 'dapi-budget' }),
  hyphenDown: stamp('hyphen', 30_000, { fallback: 'dapi-down' }),
  local: stamp('local', 0),
  rate: stamp('rate', 40_000),
  rateDown: stamp('rate', 4 * 60_000),
  immutable: stamp('dapi', 86_400_000, { immutable: true }),
}

export const IDS = {
  identity: 'BjixEUbqeUZK7BRdqtLgjzwFBovx4BRwS2iwhMriiYqp',
  identity2: '7P3ZsJ8dEqQ6mY1xNfK4tVb2cWgR5uHaL9jXoDn9TnJm',
  protx: '9ca6b0a82b687929e97ecb074be77eb22f106f60adc55cee8485ab6a88a980b2',
  protx2: '481a66f4bd3e0a1c22fa5d7ee19c8844b0f5d3a1c2e7b9f0a6d4c8e1b3f5a7c9',
  evo: '62472fd3a1e5b7c9d0f2a4b6c8e0d1f3a5b7c9e1d3f5a7b9c0e2d4f6a8b0c2d4',
  tx: 'cb4c0d655f15ba97aa1a8e71f746db6fd15530df83d6d355396620705f5bcdf0',
  block: '000000000000001ba106dbf586a6d6e54c3c077a5fc894960896a83b4bda525c',
  address: 'XtNfacxAyGM1qfmTifGgLL1Q7JxX7pGXck',
  contract: 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec',
  transition: 'BB82CB1BF8D2C1A7E54B4F0C6E3A0A5D7F0C2B9E1D4A6C8B0E2F4A6C8E0B2D4F',
}

export const CHIP_SAMPLES: { kind: EntityKind; id: string; label?: string }[] = [
  { kind: 'block', id: '2569992' },
  { kind: 'tx', id: IDS.tx },
  { kind: 'address', id: IDS.address },
  { kind: 'masternode', id: IDS.protx, label: '188.40.163.5:9999' },
  { kind: 'evonode', id: IDS.evo, label: '49.13.154.121:9999' },
  {
    kind: 'proposal',
    id: 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90',
    label: 'Fund the explorer',
  },
  { kind: 'platform-block', id: '468952' },
  { kind: 'transition', id: IDS.transition },
  { kind: 'identity', id: IDS.identity, label: 'pshenmic.dash' },
  { kind: 'identity', id: IDS.identity2 },
  { kind: 'contract', id: IDS.contract, label: 'DPNS' },
  { kind: 'document', id: 'F3a9c1d2e4b6a8c0e2d4f6a8b0c2e4d6f8a0b2c4d6e8f0a2b4c6d8e0f2a4b6c8' },
  { kind: 'token', id: 'H7FRpZJqZK933r9CzZMsCuf1BM6PHFUR4kV3cX9H8hAo', label: 'DUSD' },
  { kind: 'name', id: 'pshenmic.dash' },
  { kind: 'platform-address', id: 'dash1kqzyzy8pnpl3a9mr87qz3cx3m8l8y2ujcl9sxf9s' },
  { kind: 'epoch', id: '88' },
  { kind: 'quorum', id: '0000000000000008e5c1b9d2a1f3c5e7a9b1d3f5a7c9e1b3d5f7a9c1e3b5d7f9' },
  { kind: 'group', id: 'GWRS…31Ec · position 2', label: 'Group 2' },
  { kind: 'contest', id: 'alice', label: 'alice.dash' },
]

export interface MasternodeRow {
  id: string
  ip: string
  kind: 'masternode' | 'evonode'
  status: 'good' | 'warn' | 'bad'
  version: string
  country: string
  city: string
  host: string
  lastPaid: number
  paidAgo: number
  ready: boolean
}

const HOSTS = ['Hetzner', 'Contabo', 'OVH', 'Vultr (Constant)', 'NodeHub LLC', 'Amazon.com, Inc.']
const PLACES: [string, string][] = [
  ['DE', 'Falkenstein'],
  ['DE', 'Nuremberg'],
  ['GB', 'London'],
  ['SG', 'Singapore'],
  ['NL', 'Haarlem'],
  ['US', 'Boardman'],
]

function hexOf(seed: number): string {
  let h = seed * 2654435761
  let out = ''
  for (let i = 0; i < 64; i++) {
    h = (Math.imul(h ^ (h >>> 15), 2246822519) + i) >>> 0
    out += (h & 15).toString(16)
  }
  return out
}

export function maskRows(n: number, offset = 0): MasternodeRow[] {
  return Array.from({ length: n }, (_, i) => {
    const k = i + offset
    const [country, city] = PLACES[k % PLACES.length] ?? PLACES[0] ?? ['DE', 'Falkenstein']
    return {
      id: hexOf(k + 1),
      ip: `${188 - (k % 7)}.${40 + (k % 9)}.${163 - (k % 5)}.${(k * 7) % 250}:9999`,
      kind: k % 5 === 1 ? 'evonode' : 'masternode',
      status: k % 11 === 4 ? 'warn' : 'good',
      version: k % 4 === 1 ? '23.1.8' : '24.0.0',
      country,
      city,
      host: HOSTS[k % HOSTS.length] ?? 'Hetzner',
      lastPaid: 2_569_990 - k,
      paidAgo: 5 + k * 2,
      ready: k % 5 !== 1 && k % 7 !== 3,
    }
  })
}
