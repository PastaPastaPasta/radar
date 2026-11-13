import { describe, expect, it } from 'vitest'
import { setSourceModeFromLink, writeSourceMode } from '@/lib/source-mode'
import { entityHref } from './hrefs'

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
