import type { NetworkId } from './network'

/**
 * The contracts, tokens and identities Radar names, per network, and the one place that names them. A page that shows
 * an id of one of these gives it the label here (`Entity` does it for any chip); nobody keeps a table of their own.
 *
 * Sources:
 * - System data contracts: `packages/*-contract/lib/systemIds.js` in dashpay/platform. Their ids are protocol constants,
 *   identical on mainnet, testnet and every devnet, and all are owned by the system identity.
 * - Tokens: Platform Explorer's `GET /tokens` (`review/fixtures` records, 2026-11-10: mainnet lists five tokens, testnet
 *   the review token among 1314). Only tokens people use under that name are listed.
 *
 * Names are proper names and stay in English; they are not in the message catalogs.
 */

export interface WellKnownContract {
  key: string
  id: string
  name: string
  description: string
}

export interface WellKnownToken {
  id: string
  /** What the chip shows. */
  symbol: string
  name: string
  contractId: string
  position: number
  decimals: number
}

export interface WellKnownIdentity {
  id: string
  name: string
  description: string
}

/** The owner of every system contract (the all-ones identifier). */
export const SYSTEM_IDENTITY = '11111111111111111111111111111111'

const SYSTEM_CONTRACTS: readonly WellKnownContract[] = [
  {
    key: 'dpns',
    id: 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec',
    name: 'DPNS',
    description: 'Dash Platform Name Service: human-readable usernames.',
  },
  {
    key: 'dashpay',
    id: 'Bwr4WHCPz5rFVAD87RqTs3izo4zpzwsEdKPWUT1NS1C7',
    name: 'DashPay',
    description: 'Profiles and contact requests.',
  },
  {
    key: 'withdrawals',
    id: '4fJLR2GYTPFdomuTVvNy3VRrvWgvkKPzqehEBpNf2nk6',
    name: 'Withdrawals',
    description: 'Credit withdrawals back to Core.',
  },
  {
    key: 'masternode-reward-shares',
    id: 'rUnsWrFu3PKyRMGk2mxmZVBPbQuZx2qtHeFjURoQevX',
    name: 'Masternode reward shares',
    description: 'How an evonode shares its rewards.',
  },
  {
    key: 'feature-flags',
    id: 'HY1keaRK5bcDmujNCQq5pxNyvAiHHpoHQgLN5ppiu4kh',
    name: 'Feature flags',
    description: 'Protocol feature flags.',
  },
  {
    key: 'wallet-utils',
    id: '7CSFGeF4WNzgDmx94zwvHkYaG3Dx4XEe5LFsFgJswLbm',
    name: 'Wallet utils',
    description: 'Shared wallet utility documents.',
  },
  {
    key: 'token-history',
    id: '43gujrzZgXqcKBiScLa4T8XTDnRhenR9BLx8GWVHjPxF',
    name: 'Token history',
    description: 'Token transfer and distribution records.',
  },
  {
    key: 'keyword-search',
    id: 'BsjE6tQxG47wffZCRQCovFx5rYrAYYC3rTVRWKro27LA',
    name: 'Keyword search',
    description: 'Keyword index for finding documents.',
  },
]

const TOKENS: Partial<Record<'mainnet' | 'testnet', readonly WellKnownToken[]>> = {
  mainnet: [
    {
      id: 'AxAYWyXV6mrm8Sq7vc7wEM18wtL8a8rgj64SM3SDmzsB',
      symbol: 'SANS',
      name: 'Sansnote',
      contractId: 'ENDv6HL8MrkAhotcM5vBDaTy4ameZzyHN4MWB7mp13TR',
      position: 0,
      decimals: 8,
    },
    {
      id: 'DYqxCsuDgYsEAJ2ADnimkwNdL7C4xbe4No4so19X9mmd',
      symbol: 'DUSD',
      name: 'Dash USD',
      contractId: '8CkcAPokwFdxEu2tUu2VdLTjgK3eeR1wUGJcxhjsWaDz',
      position: 0,
      decimals: 6,
    },
  ],
  testnet: [
    {
      id: '9YxdbQUjJmQsmVPen95HjAU3Esj7tVkWSY2EQWT84ZQP',
      symbol: 'token',
      name: 'token',
      contractId: 'Y189uedQG3CJCuu83P3DqnG7ngQaRKz69x3gY8uDzQe',
      position: 0,
      decimals: 1,
    },
  ],
}

const IDENTITIES: readonly WellKnownIdentity[] = [
  {
    id: SYSTEM_IDENTITY,
    name: 'Platform system',
    description: 'Owns the system data contracts and the DPNS top-level domain.',
  },
]

/** A devnet has the protocol's own contracts and no tokens we know of. */
export function wellKnownContracts(_net: NetworkId): readonly WellKnownContract[] {
  return SYSTEM_CONTRACTS
}

export function wellKnownTokens(net: NetworkId): readonly WellKnownToken[] {
  return net === 'mainnet' || net === 'testnet' ? (TOKENS[net] ?? []) : []
}

export function wellKnownIdentities(_net: NetworkId): readonly WellKnownIdentity[] {
  return IDENTITIES
}

/** The system contract with this key (`dpns`, `dashpay`, `withdrawals`, …). */
export function systemContract(key: string): WellKnownContract {
  const found = SYSTEM_CONTRACTS.find((c) => c.key === key)
  if (!found) throw new Error(`No system contract ${key}`)
  return found
}

export type LabelOverlay = (net: NetworkId, kind: string, id: string) => string | undefined

const overlays = new Set<LabelOverlay>()
const listeners = new Set<() => void>()
let version = 0

function changed(): void {
  version++
  for (const cb of [...listeners]) cb()
}

/**
 * Adds a source of labels that wins over the table (the user's own labels, stored locally). Returns the function that
 * removes it. Call `notifyLabelsChanged` when what it returns changes.
 */
export function registerLabelOverlay(overlay: LabelOverlay): () => void {
  overlays.add(overlay)
  changed()
  return () => {
    if (overlays.delete(overlay)) changed()
  }
}

export function notifyLabelsChanged(): void {
  changed()
}

export function subscribeLabels(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

/** Changes whenever the labels may have changed; for `useSyncExternalStore`. */
export const labelsVersion = (): number => version

/**
 * The name for a contract, token or identity id on `net`: an overlay's label first, then the table's. `kind` is an
 * `EntityKind`; only `contract` (the name), `token` (the symbol) and `identity` (the name) have table entries.
 */
export function wellKnownLabel(net: NetworkId, kind: string, id: string): string | undefined {
  for (const overlay of overlays) {
    const label = overlay(net, kind, id)
    if (label) return label
  }
  if (kind === 'contract') return wellKnownContracts(net).find((c) => c.id === id)?.name
  if (kind === 'token') return wellKnownTokens(net).find((t) => t.id === id)?.symbol
  if (kind === 'identity') return wellKnownIdentities(net).find((i) => i.id === id)?.name
  return undefined
}
