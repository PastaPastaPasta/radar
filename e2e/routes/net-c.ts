import { perNet } from './fixtures'
import type { RouteCase } from './types'

/** "Masternode" until a record names the page, then its host and port. */
const MN_H1 = /^(Masternode|[\d.]+(:\d+)?)$/

/**
 * The masternode page and its tabs. In Decentralized only mode the header and the registration come from DAPI's
 * list and the rest says once, per tab, that it needs Radar, so every case is `partial`; an unknown ProTx shows the
 * unavailable state once.
 */
export const netC: RouteCase[] = perNet(({ id }) => {
  const regular = id('mn_regular', '0'.repeat(64))
  const evo = id('mn_evo', '0'.repeat(64))
  const partial = (path: string): RouteCase => ({
    path,
    h1: MN_H1,
    built: true,
    decentralized: 'partial',
  })
  return [
    partial(`/mn/${regular}`),
    partial(`/mn/${evo}?tab=platform`),
    partial(`/mn/${regular}?tab=history`),
    partial(`/mn/${regular}?tab=payments`),
    partial(`/mn/${regular}?tab=network`),
    { path: `/mn/${'0'.repeat(64)}`, h1: 'Masternode', built: true, decentralized: 'unavailable' },
  ]
})
