import { describe, expect, it } from 'vitest'
import { matchPages } from './pages'

describe('the page list', () => {
  it('finds Network internals for network, peers, utxo and versions @HY-12', () => {
    for (const q of ['network', 'peers', 'utxo', 'versions', 'network internals']) {
      expect(
        matchPages(q).map((p) => p.path),
        q,
      ).toContain('/internals')
    }
  })
})
