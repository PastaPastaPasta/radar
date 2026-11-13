import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

  it('takes the page’s layer and eyebrow', async () => {
    await renderInApp(
      <PageFrame path="/b" title="Two" layer="platform" eyebrow="Platform">
        <p>body</p>
      </PageFrame>,
      '/?network=testnet',
    )
    expect(document.querySelector('[data-page="/b"]')).toHaveAttribute('data-layer', 'platform')
    expect(document.querySelector('[data-eyebrow]')).toHaveTextContent('Platform · Testnet')
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
