import type { Budget } from './budget'
import { SourceError } from '../errors'
import type { DapiTransport } from './transport'

function unavailable(): never {
  throw new SourceError({
    source: 'dapi',
    kind: 'unavailable',
    message: 'The DAPI client is not available in this build',
  })
}

/** Reports no headroom, so list views serve from Hyphen until a real transport is installed. */
const noBudget: Budget = {
  snapshot: () => ({
    pressure: 'exhausted',
    headroom: 0,
    capacity: 0,
    benched: 0,
    usedLastMinute: 0,
  }),
  canAfford: () => false,
  subscribe: () => () => undefined,
}

/** Stand-in for the production transport (node discovery, budget, racing, caching). Every call throws `unavailable`. */
export const unavailableDapiTransport: DapiTransport = {
  budget: noBudget,
  unary: () => Promise.resolve().then(unavailable),
  stream: unavailable,
}

let current: DapiTransport = unavailableDapiTransport

/** The transport the Core façade uses. Fixture builds install `FixtureDapiTransport` at startup. */
export function getDapiTransport(): DapiTransport {
  return current
}

export function setDapiTransport(transport: DapiTransport): void {
  current = transport
}
