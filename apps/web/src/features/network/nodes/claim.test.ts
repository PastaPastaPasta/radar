import { afterEach, describe, expect, it } from 'vitest'
import { activateLocale } from '@/i18n'
import { nodesClaim } from './claim'

afterEach(() => activateLocale('en'))

describe('the nodes headline', () => {
  it('counts one node in the singular @IN-09', () => {
    expect(nodesClaim(1)).toBe('1 Dash node answered the last crawl')
    expect(nodesClaim(2_581)).toBe('2,581 Dash nodes answered the last crawl')
    expect(nodesClaim(0)).toBe('0 Dash nodes answered the last crawl')
  })

  it('takes the plural form each language needs @IN-13', async () => {
    await activateLocale('ru')
    expect(nodesClaim(1)).toBe('1 узел Dash ответил при последнем обходе')
    expect(nodesClaim(3)).toBe('3 узла Dash ответили при последнем обходе')
    expect(nodesClaim(11)).toBe('11 узлов Dash ответили при последнем обходе')
    await activateLocale('uk')
    expect(nodesClaim(1)).toBe('1 вузол Dash відповів в останньому обході')
    expect(nodesClaim(3)).toBe('3 вузли Dash відповіли в останньому обході')
    expect(nodesClaim(11)).toBe('11 вузлів Dash відповіли в останньому обході')
    await activateLocale('de')
    expect(nodesClaim(1)).toBe('1 Dash-Knoten hat beim letzten Crawl geantwortet')
    expect(nodesClaim(5)).toBe('5 Dash-Knoten haben beim letzten Crawl geantwortet')
  })
})
