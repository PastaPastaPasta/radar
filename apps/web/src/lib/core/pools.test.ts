import { describe, expect, it } from 'vitest'
import { coinbaseTagOf, poolOfCoinbase } from './pools'

const hex = (s: string) =>
  [...new TextEncoder().encode(s)].map((b) => b.toString(16).padStart(2, '0')).join('')

describe('poolOfCoinbase', () => {
  it('finds a pool by its tag, whatever the case', () => {
    expect(poolOfCoinbase(`03653727${hex('/ViaBTC/Mined by x/')}`)).toBe('ViaBTC')
    expect(poolOfCoinbase(hex('Mined by AntPool'))).toBe('AntPool')
  })
  it('knows F2Pool by its Chinese tag', () => {
    expect(poolOfCoinbase(hex('七彩神仙鱼'))).toBe('F2Pool')
  })
  it('gives no pool for an untagged script', () => {
    expect(poolOfCoinbase('6a')).toBeUndefined()
    expect(poolOfCoinbase(undefined)).toBeUndefined()
  })
  it('drops bidi and other format characters from the tag', () => {
    const tag = coinbaseTagOf(hex('/Pool\u202e evil\u2066\u200b\u2069 tag/'))
    expect(tag).not.toMatch(/[\u202a-\u202e\u2066-\u2069\u200b]/u)
    expect(tag).toBe('/Pool evil tag/')
  })
  it('collapses control bytes in the tag', () => {
    expect(coinbaseTagOf(`0001${hex('/nodeStratum/')}`)).toBe('/nodeStratum/')
  })
})
