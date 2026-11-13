import { describe, expect, it } from 'vitest'
import { tokenHoldersPrefetch, tokenPrefetch, tokensPrefetch } from './p-token'

const TOKEN = '8eTDkBhpQjHeqgbVeriwLeZr1tCa6yBGw76SckvD1cwc'

describe('p-token prefetch', () => {
  it('reads the first page of the list from Platform Explorer, never on a devnet', () => {
    expect(tokensPrefetch('mainnet', {}, { page: 1, limit: 25 }).map((i) => i.cost)).toEqual([
      'http',
    ])
    expect(tokensPrefetch('devnet-paloma', {}, { page: 1, limit: 25 })).toEqual([])
  })

  it('reads the token record on the overview tab and the contract through the SDK ready gate', () => {
    const overview = tokenPrefetch('testnet', { id: TOKEN }, { tab: 'overview', page: 1 })
    expect(overview.map((i) => i.cost)).toEqual(['http', 'sdk'])
    const definition = tokenPrefetch('testnet', { id: TOKEN }, { tab: 'definition', page: 1 })
    expect(definition.map((i) => i.cost)).toEqual(['sdk'])
    expect(tokenHoldersPrefetch('testnet', { id: TOKEN }, { page: 1 }).map((i) => i.cost)).toEqual([
      'sdk',
    ])
  })

  it('reads nothing for an id that is not a token ID', () => {
    expect(tokenPrefetch('testnet', { id: 'nope' }, { tab: 'overview', page: 1 })).toEqual([])
  })
})
