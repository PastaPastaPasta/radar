import { createMemoryHistory } from '@tanstack/react-router'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from '@/app'
import { parseThirdParty } from './third-party'

describe('About page @NX-76', () => {
  it('explains the proof model, the limits of lists, where to act, privacy and licences', async () => {
    render(<App history={createMemoryHistory({ initialEntries: ['/about'] })} />)
    await screen.findByRole('heading', { level: 1, name: 'About' })
    for (const heading of [
      'What “proof-checked” means',
      'What can’t be listed without an index',
      'Where to act',
      'Privacy',
      'Sources and licences',
    ]) {
      expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument()
    }
    expect(screen.getByText(/one-node claim/)).toBeInTheDocument()
    expect(screen.getByText(/no analytics, no cookies, no accounts/)).toBeInTheDocument()
    const act = screen.getByRole('heading', { name: 'Where to act' }).closest('section')!
    expect(within(act).getByRole('link', { name: /Bridge/ })).toHaveAttribute(
      'href',
      'https://bridge.dashhq.org/?network=mainnet',
    )
    expect(within(act).getByRole('link', { name: /Governance/ })).toHaveAttribute(
      'href',
      'https://gov.dashhq.org/',
    )
  })

  it('carries the network in the links it says carry it', async () => {
    render(<App history={createMemoryHistory({ initialEntries: ['/about?network=testnet'] })} />)
    const act = (await screen.findByRole('heading', { name: 'Where to act' })).closest('section')!
    expect(within(act).getByRole('link', { name: /Bridge/ })).toHaveAttribute(
      'href',
      'https://bridge.dashhq.org/?network=testnet',
    )
    expect(within(act).getByRole('link', { name: /Governance/ })).toHaveAttribute(
      'href',
      'https://gov.dashhq.org/?network=testnet',
    )
  })

  it('lists what THIRD_PARTY.md lists', async () => {
    render(<App history={createMemoryHistory({ initialEntries: ['/about'] })} />)
    await screen.findByRole('heading', { name: 'Sources and licences' })
    const items = await screen.findAllByText(/MIT/, { selector: '[data-third-party] span' })
    expect(items.length).toBeGreaterThan(0)
  })

  it('reads the table of THIRD_PARTY.md', () => {
    const rows = parseThirdParty(
      [
        '# Third-party',
        'text',
        '| Component | Source | Licence | Where it is used |',
        '| --- | --- | --- | --- |',
        '| A thing | [proj](https://example.org/proj) page | MIT | `features/x/` |',
        '| Plain | somewhere | ISC | `lib/` |',
      ].join('\n'),
    )
    expect(rows).toEqual([
      {
        component: 'A thing',
        source: 'proj page',
        url: 'https://example.org/proj',
        licence: 'MIT',
        usedIn: 'features/x/',
      },
      { component: 'Plain', source: 'somewhere', licence: 'ISC', usedIn: 'lib/' },
    ])
  })
})
