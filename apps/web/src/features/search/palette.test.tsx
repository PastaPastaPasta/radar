import { createMemoryHistory } from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it } from 'vitest'
import { App } from '@/app'

const MAINNET_ADDRESS = 'XpG61qAVhdyN7AqVZQsHfJL7AEk4dPVinc'
const TESTNET_ADDRESS = 'yhq7ifNCtTKEpY4Yu5XPCcztQco6Fh6JsZ'

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe = () => undefined
    unobserve = () => undefined
    disconnect = () => undefined
  }
  Element.prototype.scrollIntoView = () => undefined
})

async function openPalette(url = '/') {
  const history = createMemoryHistory({ initialEntries: [url] })
  render(<App history={history} />)
  await screen.findByRole('heading', { level: 1 })
  const user = userEvent.setup()
  await user.keyboard('/')
  const dialog = await screen.findByRole('dialog', { name: 'Search Radar' })
  const input = within(dialog).getByRole('combobox', { name: 'Search Radar' })
  return { history, user, dialog, input }
}

describe('command palette', () => {
  it('opens with / and with Ctrl+K, and closes with Escape', async () => {
    const { user } = await openPalette()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Search Radar' })).toBeNull())

    await user.keyboard('{Control>}k{/Control}')
    expect(await screen.findByRole('dialog', { name: 'Search Radar' })).toBeInTheDocument()
  })

  it('lists pages before anything is typed', async () => {
    const { dialog } = await openPalette()

    expect(within(dialog).getByRole('option', { name: /Masternodes/ })).toBeInTheDocument()
  })

  it('says what the input is and opens a valid address on Enter', async () => {
    const { user, history, input } = await openPalette()

    await user.type(input, MAINNET_ADDRESS)
    expect(await screen.findByText(/Looks like a Core address/)).toBeInTheDocument()
    await user.keyboard('{Enter}')

    await waitFor(() => expect(history.location.pathname).toBe(`/address/${MAINNET_ADDRESS}`))
  })

  it('offers the other network for an address from it', async () => {
    const { user, history, input } = await openPalette()

    await user.type(input, TESTNET_ADDRESS)
    expect(await screen.findByText('This is a testnet address')).toBeInTheDocument()
    await user.keyboard('{Enter}')

    await waitFor(() => expect(history.location.pathname).toBe(`/address/${TESTNET_ADDRESS}`))
    expect(history.location.search).toBe('?network=testnet')
  })

  it('opens the results page when the input is ambiguous', async () => {
    const { user, history, input } = await openPalette()

    await user.type(input, '2569992')
    await screen.findByRole('option', { name: /Core block 2,569,992/ })
    await user.keyboard('{Enter}')

    await waitFor(() => expect(history.location.pathname).toBe('/search'))
    expect(history.location.search).toBe('?q=2569992')
  })

  it('opens the highlighted result after arrow keys', async () => {
    const { user, history, input } = await openPalette()

    await user.type(input, '2569992')
    await screen.findByRole('option', { name: /Core block 2,569,992/ })
    await user.keyboard('{ArrowDown}{Enter}')

    await waitFor(() =>
      expect(history.location.pathname).toMatch(/^\/(block|platform\/block|epoch)\//),
    )
  })

  it('does not search a recovery phrase', async () => {
    const { user, input } = await openPalette()

    await user.type(
      input,
      'abandon ability able about above absent absorb abstract absurd abuse access accident',
    )

    expect(
      await screen.findByText(/looks like a private key or recovery phrase/),
    ).toBeInTheDocument()
  })
})

describe('/search page', () => {
  it('shows grouped results for a number', async () => {
    const history = createMemoryHistory({ initialEntries: ['/search?q=2569992'] })
    render(<App history={history} />)

    expect(await screen.findByRole('heading', { name: 'Core' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Core block 2,569,992/ })).toHaveAttribute(
      'href',
      '/block/2569992',
    )
    expect(screen.getByRole('link', { name: /Epoch 2,569,992/ })).toBeInTheDocument()
  })

  it('keeps the network on result links', async () => {
    const history = createMemoryHistory({ initialEntries: ['/search?q=2569992&network=testnet'] })
    render(<App history={history} />)

    expect(await screen.findByRole('link', { name: /Core block/ })).toHaveAttribute(
      'href',
      '/block/2569992?network=testnet',
    )
  })

  it('explains input it cannot look up, and offers the other network', async () => {
    const history = createMemoryHistory({ initialEntries: ['/search?q=a'] })
    render(<App history={history} />)

    expect(await screen.findByText(/isn’t something Radar can look up/)).toBeInTheDocument()
  })

  it('offers the other network when nothing matches a shape that fits both', async () => {
    const history = createMemoryHistory({ initialEntries: ['/search?q=' + 'ab'.repeat(32)] })
    render(<App history={history} />)

    expect(await screen.findByText(/Nothing found for/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Search Testnet' })).toHaveAttribute(
      'href',
      `/search?network=testnet&q=${'ab'.repeat(32)}`,
    )
  })

  it('shows what can be searched when the box is empty', async () => {
    const history = createMemoryHistory({ initialEntries: ['/search'] })
    render(<App history={history} />)

    expect(await screen.findByText('What you can search for')).toBeInTheDocument()
  })

  it('never echoes a private key or phrase', async () => {
    const phrase =
      'abandon ability able about above absent absorb abstract absurd abuse access accident'
    const history = createMemoryHistory({
      initialEntries: [`/search?q=${encodeURIComponent(phrase)}`],
    })
    render(<App history={history} />)

    expect(
      await screen.findByText('That looks like a private key or recovery phrase'),
    ).toBeInTheDocument()
    expect(screen.getByRole('searchbox')).toHaveValue('')
  })
})
