import { afterEach, describe, expect, it } from 'vitest'
import { activateLocale } from '@/i18n'
import { nodesClaim } from './claim'

afterEach(() => activateLocale('en'))

describe('the nodes headline', () => {
  it('counts masternodes, each once, in the singular for one @IN-09', () => {
    expect(nodesClaim(1)).toBe('1 masternode answered the last crawl')
    expect(nodesClaim(2_190)).toBe('2,190 masternodes answered the last crawl')
    expect(nodesClaim(0)).toBe('0 masternodes answered the last crawl')
  })

  it('takes the plural form each language needs @IN-13', async () => {
    await activateLocale('ru')
    expect(nodesClaim(1)).toBe('1 мастернода ответила при последнем обходе')
    expect(nodesClaim(3)).toBe('3 мастерноды ответили при последнем обходе')
    expect(nodesClaim(11)).toBe('11 мастернод ответили при последнем обходе')
    await activateLocale('uk')
    expect(nodesClaim(1)).toBe('1 мастернода відповіла в останньому обході')
    expect(nodesClaim(3)).toBe('3 мастерноди відповіли в останньому обході')
    expect(nodesClaim(11)).toBe('11 мастернод відповіли в останньому обході')
    await activateLocale('de')
    expect(nodesClaim(1)).toBe('1 Masternode hat beim letzten Crawl geantwortet')
    expect(nodesClaim(5)).toBe('5 Masternodes haben beim letzten Crawl geantwortet')
  })
})
