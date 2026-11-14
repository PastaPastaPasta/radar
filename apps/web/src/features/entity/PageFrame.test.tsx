import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetAnnouncer } from '@/ui/announce'
import { PageFrame } from './PageFrame'
import { renderInApp } from './test-utils'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  resetAnnouncer()
})

describe('PageFrame', () => {
  it('draws a Core page by default and the layer it is given otherwise', async () => {
    await renderInApp(
      <PageFrame path="/a" title="One">
        <p>body</p>
      </PageFrame>,
    )
    expect(document.querySelector('[data-page="/a"]')).toHaveAttribute('data-layer', 'core')
    expect(screen.getByRole('heading', { level: 1, name: 'One' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Copy link' })).not.toBeInTheDocument()
  })

  it('takes the page’s layer, and an eyebrow that names a parent page', async () => {
    await renderInApp(
      <PageFrame path="/governance/$hash" title="Proposal" layer="platform" eyebrow="Governance">
        <p>body</p>
      </PageFrame>,
      '/?network=testnet',
    )
    expect(document.querySelector('[data-page="/governance/$hash"]')).toHaveAttribute(
      'data-layer',
      'platform',
    )
    expect(document.querySelector('[data-eyebrow]')).toHaveTextContent('Governance · Testnet')
  })

  it('draws no eyebrow for the section the rail already names', async () => {
    await renderInApp(
      <PageFrame path="/epochs" title="Epochs" layer="network" eyebrow="Network">
        <p>body</p>
      </PageFrame>,
      '/?network=testnet',
    )
    expect(document.querySelector('[data-eyebrow]')).toBeNull()
  })

  it('opens with the page’s claim once there is one, and with its name until then', async () => {
    function Page() {
      const [count, setCount] = useState<string>()
      return (
        <PageFrame
          path="/nodes"
          title="Nodes"
          layer="network"
          claim={count ? <>{count} Dash nodes answered</> : undefined}
        >
          <button type="button" onClick={() => setCount('2,581')}>
            land
          </button>
        </PageFrame>
      )
    }
    await renderInApp(<Page />)
    const h1 = () => screen.getByRole('heading', { level: 1 })
    expect(h1()).toHaveTextContent('Nodes')
    expect(h1()).not.toHaveAttribute('data-claim')
    await waitFor(() => expect(document.title).toMatch(/^Nodes/))
    await userEvent.click(screen.getByRole('button', { name: 'land' }))
    expect(h1()).toHaveTextContent('2,581 Dash nodes answered')
    expect(h1()).toHaveAttribute('data-claim')
    expect(document.title).toMatch(/^Nodes/)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('shows the actions and, with share, a button that copies the address with its network', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    await renderInApp(
      <PageFrame path="/c" title="Three" layer="platform" actions={<a href="/x">Open</a>} share>
        <p>body</p>
      </PageFrame>,
      '/?network=testnet&tab=keys',
    )
    expect(screen.getByRole('link', { name: 'Open' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Copy link' }))
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/?network=testnet&tab=keys`)
    })
    await waitFor(() => {
      expect(document.getElementById('rx-announcer')).toHaveTextContent('Link copied')
    })
  })
})
