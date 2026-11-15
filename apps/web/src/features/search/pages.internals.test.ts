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

  it('finds every decoder, and the chooser, by name @NX-72', () => {
    const decoders = ['contract', 'identity', 'document', 'proof', 'path']
    for (const id of decoders) {
      expect(
        matchPages(`${id} decoder`).map((p) => p.path),
        id,
      ).toContain(`/tools/${id}`)
    }
    expect(matchPages('decoders').map((p) => p.path)).toContain('/tools/decoders')
    expect(matchPages('grovedb').map((p) => p.path)).toEqual(
      expect.arrayContaining(['/tools/proof', '/tools/path']),
    )
  })
})
