import { describe, expect, it } from 'vitest'
import { NEWEST_FIRST, textFilter, tokensQuery } from './token-list'

const ID = 'AxAYWyXV6mrm8Sq7vc7wEM18wtL8a8rgj64SM3SDmzsB'

describe('textFilter', () => {
  it('searches an ID by ID and anything name-like by prefix', () => {
    expect(textFilter(ID)).toEqual({ token_id: ID })
    expect(textFilter('DUSD')).toEqual({ token_name: 'DUSD' })
  })

  it('sends nothing for text Platform Explorer cannot match', () => {
    expect(textFilter('two words')).toEqual({})
    expect(textFilter('x'.repeat(26))).toEqual({})
  })
})

describe('tokensQuery', () => {
  it('sends only what the address asks for, under Platform Explorer’s names', () => {
    const base = { page: 1, limit: 25 }
    expect(tokensQuery(base)).toEqual({})
    expect(tokensQuery({ ...base, sort: NEWEST_FIRST })).toEqual({ order: 'desc' })
    expect(tokensQuery({ ...base, sort: 'whatever' })).toEqual({})
    expect(tokensQuery({ ...base, owner: 'O', contract: 'C', q: 'DUSD' })).toEqual({
      owner: 'O',
      contract_id: 'C',
      token_name: 'DUSD',
    })
  })
})
