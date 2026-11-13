import { createMemoryHistory } from '@tanstack/react-router'
import { describe, expect, it } from 'vitest'
import { createQueryClient } from '@/app/query-client'
import { createAppRouter } from '@/router'
import { KIND_META, type EntityKind } from '@/ui'
import { setSourceModeFromLink, writeSourceMode } from '@/lib/source-mode'
import { entityHref, entityPath } from './hrefs'

const HEX = 'ab'.repeat(32)
const ID = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec'

const CASES: Record<EntityKind, { id: string; path: string; route: string }> = {
  block: { id: '2400000', path: '/block/2400000', route: '/block/$id' },
  tx: { id: HEX, path: `/tx/${HEX}`, route: '/tx/$txid' },
  address: { id: 'XabcDEF', path: '/address/XabcDEF', route: '/address/$address' },
  masternode: { id: HEX, path: `/mn/${HEX}`, route: '/mn/$protx' },
  evonode: { id: HEX, path: `/mn/${HEX}`, route: '/mn/$protx' },
  proposal: { id: HEX, path: `/governance/${HEX}`, route: '/governance/$hash' },
  'platform-block': { id: '1200', path: '/platform/block/1200', route: '/platform/block/$id' },
  transition: { id: HEX, path: `/platform/tx/${HEX}`, route: '/platform/tx/$hash' },
  identity: { id: ID, path: `/identity/${ID}`, route: '/identity/$id' },
  contract: { id: ID, path: `/contract/${ID}`, route: '/contract/$id/' },
  document: {
    id: `${ID}/note/${HEX}`,
    path: `/document/${ID}/note/${HEX}`,
    route: '/document/$contract/$type/$id',
  },
  token: { id: ID, path: `/token/${ID}`, route: '/token/$id/' },
  name: { id: 'alice.dash', path: '/name/alice.dash', route: '/name/$label' },
  'platform-address': {
    id: 'tdash1abc',
    path: '/platform-address/tdash1abc',
    route: '/platform-address/$addr',
  },
  epoch: { id: '42', path: '/epoch/42', route: '/epoch/$n' },
  quorum: { id: HEX, path: `/quorums?q=${HEX}`, route: '/quorums' },
  group: { id: `${ID}/3`, path: `/group/${ID}/3`, route: '/group/$contract/$pos' },
  contest: { id: 'alice', path: '/contest/alice', route: '/contest/$label' },
}

function lastRouteId(href: string): string | undefined {
  const router = createAppRouter(
    createQueryClient(),
    createMemoryHistory({ initialEntries: [href] }),
  )
  const matches = router.matchRoutes(
    router.history.location.pathname,
    router.history.location.search,
  )
  return matches.at(-1)?.routeId
}

describe('entityPath @X-09', () => {
  it('has a case for every entity kind', () => {
    expect(Object.keys(CASES).sort()).toEqual(Object.keys(KIND_META).sort())
  })

  it.each(Object.entries(CASES))('builds the %s page address', (kind, c) => {
    expect(entityPath(kind as EntityKind, c.id)).toBe(c.path)
  })

  it.each(Object.entries(CASES))('lands %s on its own route', (kind, c) => {
    expect(lastRouteId(entityHref(kind as EntityKind, c.id, 'testnet'))).toBe(c.route)
  })

  it('names the contract, type and index of a contest outside DPNS', () => {
    const search = { contract: ID, type: 'domain', index: 'parentNameAndLabel' }
    const href = entityHref('contest', 'alice', 'testnet', search)
    expect(href).toBe(
      `/contest/alice?contract=${ID}&type=domain&index=parentNameAndLabel&network=testnet`,
    )
    expect(lastRouteId(href)).toBe('/contest/$label')
  })

  it('leaves out empty search values and joins a quorum’s own parameter', () => {
    expect(entityPath('contest', 'alice', { contract: undefined, type: '' })).toBe('/contest/alice')
    expect(entityPath('quorum', HEX, { type: '4' })).toBe(`/quorums?q=${HEX}&type=4`)
  })

  it('encodes a label that is not a plain path segment', () => {
    expect(entityPath('contest', 'a b')).toBe('/contest/a%20b')
  })
})

describe('entityHref and Decentralized only mode @X-05 @X-09', () => {
  it('names the network and nothing else while the mode is off', () => {
    expect(entityHref('block', '12', 'mainnet')).toBe('/block/12')
    expect(entityHref('block', '12', 'testnet')).toBe('/block/12?network=testnet')
  })

  it('carries a mode the address turned on, so a link opened in a new tab stays in it', () => {
    setSourceModeFromLink('decentralized')
    expect(entityHref('tx', 'ab', 'mainnet')).toBe('/tx/ab?sources=decentralized')
    expect(entityHref('tx', 'ab', 'testnet')).toBe('/tx/ab?network=testnet&sources=decentralized')
    expect(entityHref('quorum', 'ab', 'mainnet')).toBe('/quorums?q=ab&sources=decentralized')
  })

  it('adds nothing for a remembered mode, which needs no address', () => {
    writeSourceMode('decentralized')
    expect(entityHref('tx', 'ab', 'mainnet')).toBe('/tx/ab')
  })
})
