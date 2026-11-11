import { describe, expect, it } from 'vitest'
import { keepPreviousOnNetwork } from './keep-previous'

describe('keepPreviousOnNetwork', () => {
  it('keeps the previous rows of the same network', () => {
    const keep = keepPreviousOnNetwork('mainnet')
    expect(keep('rows', { queryKey: ['mainnet', 'dapi', 'rows'] })).toBe('rows')
  })

  it('drops the rows of another network', () => {
    const keep = keepPreviousOnNetwork('testnet')
    expect(keep('rows', { queryKey: ['mainnet', 'dapi', 'rows'] })).toBeUndefined()
  })

  it('has nothing to keep before the first load', () => {
    expect(keepPreviousOnNetwork('mainnet')(undefined, undefined)).toBeUndefined()
  })
})
