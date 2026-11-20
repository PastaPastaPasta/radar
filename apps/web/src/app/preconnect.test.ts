import { afterEach, describe, expect, it } from 'vitest'
import { SOURCE_MODE_KEY, writeSourceMode } from '@/lib/source-mode'
import { preconnectHostedSources } from './preconnect'

const links = () =>
  [...document.head.querySelectorAll<HTMLLinkElement>('link[rel="preconnect"]')].map((l) => ({
    href: l.href,
    crossOrigin: l.crossOrigin,
  }))

describe('preconnectHostedSources', () => {
  afterEach(() => {
    document.head.querySelectorAll('link[rel="preconnect"]').forEach((l) => l.remove())
    localStorage.removeItem(SOURCE_MODE_KEY)
  })

  it('opens the Radar and Platform Explorer origins of the network the address names', () => {
    preconnectHostedSources()
    expect(links()).toEqual([
      { href: 'https://radar.dashhq.org/', crossOrigin: 'anonymous' },
      { href: 'https://api.pe.dashhq.org/', crossOrigin: 'anonymous' },
    ])
  })

  it('contacts no hosted source in Decentralized only mode', () => {
    writeSourceMode('decentralized')
    try {
      preconnectHostedSources()
      expect(links()).toEqual([])
    } finally {
      writeSourceMode('all')
    }
  })
})
