import { act, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { healthRegistry } from '@/data/health'
import { I18nProvider, i18n } from '@/i18n'
import { renderInRouter } from '@/ui/test-utils'
import { DevnetWatch } from './devnet-watch'

const fail = (net: string) => {
  for (let i = 0; i < 3; i++) {
    healthRegistry.report(net as 'mainnet', 'dapi', { ok: false, kind: 'network', latencyMs: 5 })
  }
}

const mount = (url: string) =>
  renderInRouter(
    <I18nProvider i18n={i18n}>
      <DevnetWatch />
    </I18nProvider>,
    url,
  )

afterEach(() => {
  localStorage.clear()
})

describe('a devnet whose DAPI addresses all fail @W2-26 @NX-75', () => {
  it('says Radar can’t reach them and links to the devnet settings', async () => {
    await mount('/?network=devnet-ruby')
    expect(screen.queryByRole('alert')).toBeNull()
    act(() => fail('devnet-ruby'))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Radar can’t reach these DAPI addresses')
    expect(screen.getByRole('link', { name: 'Edit devnet' })).toHaveAttribute(
      'href',
      expect.stringContaining('/settings'),
    )
  })

  it('says nothing on mainnet, however DAPI fares', async () => {
    act(() => fail('mainnet'))
    await mount('/')
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
