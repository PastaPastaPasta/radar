import { readFileSync } from 'node:fs'
import type { RouteCase, RouteNet } from './types'

export const ROUTE_NETS: readonly RouteNet[] = ['mainnet', 'testnet']

type Entities = Record<string, unknown>

const entityFiles = new Map<RouteNet, Entities>()

function entities(net: RouteNet): Entities {
  let found = entityFiles.get(net)
  if (!found) {
    try {
      const file = new URL(`../../review/fixtures/${net}.json`, import.meta.url)
      const parsed = JSON.parse(readFileSync(file, 'utf8')) as { entities?: Entities }
      found = parsed.entities ?? {}
    } catch {
      found = {}
    }
    entityFiles.set(net, found)
  }
  return found
}

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}

const PLACEHOLDER_CONTRACT = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec'
const PLACEHOLDER_ADDRESS = 'dash1krma5z3ttj75la4m93xcndna9ullamq9y5e9n5rs'

export interface NetIds {
  net: RouteNet
  /** The `id` of a review fixture entity (`review/fixtures/<net>.json`), or `fallback` when it has none. */
  id: (key: string, fallback: string) => string
  /** A Platform address with a balance, or a well-formed stand-in until the fixture file has one. */
  paddr: () => string
  /** A contract with groups and the position of one of them, or stand-ins until the fixture file has one. */
  group: () => { contract: string; position: string }
}

export function netIds(net: RouteNet): NetIds {
  const id = (key: string, fallback: string) => {
    const entity = asRecord(entities(net)[key])
    const value = entity.id
    return typeof value === 'string' || typeof value === 'number' ? String(value) : fallback
  }
  return {
    net,
    id,
    paddr: () => id('paddr', PLACEHOLDER_ADDRESS),
    group: () => {
      const entity = asRecord(entities(net).group)
      const contract = entity.contract
      const position = entity.position
      return {
        contract: typeof contract === 'string' ? contract : id('contract', PLACEHOLDER_CONTRACT),
        position:
          typeof position === 'string' || typeof position === 'number' ? String(position) : '0',
      }
    },
  }
}

/** One case per network for paths that name fixture records, each pinned to its network by `nets`. */
export function perNet(make: (ids: NetIds) => RouteCase[]): RouteCase[] {
  return ROUTE_NETS.flatMap((net) => make(netIds(net)).map((c) => ({ ...c, nets: [net] })))
}
