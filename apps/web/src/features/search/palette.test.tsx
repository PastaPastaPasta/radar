import { createMemoryHistory } from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { App } from '@/app'
import { server } from '@/test/server'
import { resolvers } from './resolvers'
import { ensureWordlist } from './wordlist'
import { localStamp } from './resolvers/helpers'
import type { Resolver, SearchHit } from './types'

const MAINNET_ADDRESS = 'XpG61qAVhdyN7AqVZQsHfJL7AEk4dPVinc'
const TESTNET_ADDRESS = 'yhq7ifNCtTKEpY4Yu5XPCcztQco6Fh6JsZ'

beforeAll(async () => {
  await ensureWordlist()
  globalThis.ResizeObserver ??= class {
    observe = () => undefined
    unobserve = () => undefined
    disconnect = () => undefined
  }
  Element.prototype.scrollIntoView = () => undefined
})

const added: Resolver[] = []
function addResolver(r: Resolver) {
  resolvers.push(r)
  added.push(r)
}
afterEach(() => {
  for (const r of added.splice(0)) resolvers.splice(resolvers.indexOf(r), 1)
})

function exactHit(kind: SearchHit['kind'], to: '/block/$id', n: number): SearchHit {
  return {
    kind,
    id: String(n),
    title: `Block ${n}`,
    href: { to, params: { id: String(n) } },
    stamp: localStamp(),
    rank: 110,
  }
}

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

    expect(within(dialog).getByRole('option', { name: /Blocks/ })).toBeInTheDocument()
    expect(within(dialog).queryByRole('option', { name: /About/ })).toBeNull()
  })

  it('says what the input is and opens a valid address on Enter', async () => {
    const { user, history, input } = await openPalette()

    await user.type(input, MAINNET_ADDRESS)
    expect(await screen.findByText(/Looks like a Core address/)).toBeInTheDocument()
    await user.keyboard('{Enter}')

    await waitFor(() => expect(history.location.pathname).toBe(`/address/${MAINNET_ADDRESS}`))
  })

  it('still opens the address on Enter once Hyphen has added its own, richer hit', async () => {
    const { user, history, dialog, input } = await openPalette()

    await user.type(input, MAINNET_ADDRESS)
    await within(dialog).findByRole('option', { name: /Core address · / })
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

  it('opens the Core block for a typed height, however fast the other sources answer', async () => {
    const { user, history, input } = await openPalette()

    await user.type(input, '2569992')
    await user.keyboard('{Enter}')

    await waitFor(() => expect(history.location.pathname).toBe('/block/2569992'))
  })

  it('opens the results page for text that is not an exact match', async () => {
    const { user, history, input } = await openPalette()

    await user.type(input, 'abandon ability able about')
    await user.keyboard('{Enter}')

    await waitFor(() => expect(history.location.pathname).toBe('/search'))
    expect(history.location.search).toBe('?q=abandon%20ability%20able%20about')
  })

  it('waits for a slow local resolver before it picks a hit', async () => {
    addResolver({
      id: 'slow-local',
      accepts: ['int'],
      cost: 'local',
      resolve: async () => {
        await new Promise((resolve) => setTimeout(resolve, 200))
        return [exactHit('block', '/block/$id', 2569992)]
      },
    })
    const { user, history, input } = await openPalette()

    await user.type(input, '2569992{Enter}')

    await waitFor(() => expect(history.location.pathname).toBe('/block/2569992'))
  })

  it('stops waiting for a network resolver after the grace period', async () => {
    addResolver({
      id: 'stuck-remote',
      accepts: ['int'],
      cost: 'index',
      resolve: () => new Promise(() => undefined),
    })
    const { user, history, input } = await openPalette()

    await user.type(input, '2569992{Enter}')

    await waitFor(() => expect(history.location.pathname).toBe('/block/2569992'), {
      timeout: 2000,
    })
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

  it('keeps a partly typed phrase in the box and out of the address on Enter', async () => {
    const { user, input } = await openPalette()

    await user.type(input, 'abandon ability able about above{Enter}')

    expect(await screen.findByText(/could be part of a recovery phrase/)).toBeInTheDocument()
    expect(input).toHaveValue('abandon ability able about above')
    expect(window.location.search).not.toContain('abandon')
  })

  it('does not put a recovery phrase in the address bar on Enter', async () => {
    const { user, input } = await openPalette()

    await user.type(
      input,
      'abandon ability able about above absent absorb abstract absurd abuse access accident{Enter}',
    )

    expect(window.location.search).not.toContain('abandon')
    expect(
      await screen.findByText(/looks like a private key or recovery phrase/),
    ).toBeInTheDocument()
  })
})

function recordVisits(history: ReturnType<typeof createMemoryHistory>): string[] {
  const visited: string[] = []
  history.subscribe(({ location }) => visited.push(location.href))
  return visited
}

describe('/search page', () => {
  it('shows grouped results for a number', async () => {
    const history = createMemoryHistory({ initialEntries: ['/search?q=2569992'] })
    render(<App history={history} />)

    expect(await screen.findByRole('heading', { name: 'Core' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Core block 2,569,992/ })).toHaveAttribute(
      'href',
      '/block/2569992',
    )
    expect(screen.queryByRole('link', { name: /Epoch 2,569,992/ })).toBeNull()
  })

  it('keeps the network on result links', async () => {
    const history = createMemoryHistory({ initialEntries: ['/search?q=2569992&network=testnet'] })
    render(<App history={history} />)

    expect(await screen.findByRole('link', { name: /Core block 2,569,992/ })).toHaveAttribute(
      'href',
      '/block/2569992?network=testnet',
    )
  })

  it('explains input it cannot look up, and offers the other network', async () => {
    const history = createMemoryHistory({ initialEntries: ['/search?q=a'] })
    render(<App history={history} />)

    expect(await screen.findByText(/isn’t something Radar can look up/)).toBeInTheDocument()
  })

  it('says nothing matched a Core record and offers a name guess once the name page exists @IN-10 @HY-14', async () => {
    server.use(http.get('*/x/hy/mainnet/search', () => HttpResponse.json({ value: [] })))
    const history = createMemoryHistory({
      initialEntries: ['/search?q=zzzz-not-a-real-core-thing-12345'],
    })
    render(<App history={history} />)

    expect(
      await screen.findByText(/No match for “zzzz-not-a-real-core-thing-12345” as a Core record/),
    ).toBeInTheDocument()
    expect(await screen.findByRole('region', { name: 'A guess' })).toBeInTheDocument()
    expect(screen.getByText('zzzz-not-a-real-core-thing-12345.dash')).toBeInTheDocument()
  })

  it('shows a confirmed hit as a result, not a guess, and drops one whose page is unfinished', async () => {
    addResolver({
      id: 'confirmed-hits',
      accepts: ['dpns'],
      cost: 'local',
      resolve: () =>
        Promise.resolve([
          {
            kind: 'masternode',
            id: 'a'.repeat(64),
            title: 'Masternode 1.2.3.4',
            href: { to: '/mn/$protx', params: { protx: 'a'.repeat(64) } },
            stamp: localStamp(),
            rank: 80,
          },
          {
            kind: 'contract',
            id: 'c'.repeat(44),
            title: 'Unbuilt contract',
            href: { to: '/contract/$id', params: { id: 'c'.repeat(44) } },
            stamp: localStamp(),
            rank: 80,
          },
        ]),
    })
    const history = createMemoryHistory({ initialEntries: ['/search?q=pshenmic.dash'] })
    render(<App history={history} />)

    expect(await screen.findByRole('heading', { name: 'Network' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Masternode 1.2.3.4/ })).toBeInTheDocument()
    expect(screen.queryByText('Unbuilt contract')).toBeNull()
    expect(screen.queryByRole('region', { name: 'A guess' })).toBeNull()
    expect(screen.queryByText(/No match for/)).toBeNull()
  })

  it('offers the other network when nothing matches a shape that fits both', async () => {
    const history = createMemoryHistory({ initialEntries: ['/search?q=' + 'ab'.repeat(32)] })
    render(<App history={history} />)

    expect(await screen.findByText(/No match for/)).toBeInTheDocument()
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

  it('never echoes a private key or phrase and strips it from the address', async () => {
    const phrase =
      'abandon ability able about above absent absorb abstract absurd abuse access accident'
    const history = createMemoryHistory({
      initialEntries: [`/search?q=${encodeURIComponent(phrase)}`],
    })
    const visited = recordVisits(history)
    render(<App history={history} />)

    await waitFor(() => expect(history.location.search).toBe(''))
    expect(
      await screen.findByText('That looks like a private key or recovery phrase'),
    ).toBeInTheDocument()
    expect(screen.getByRole('searchbox')).toHaveValue('')
    expect(visited.join()).not.toContain('abandon')
    expect(document.title).not.toContain('abandon')
  })

  it('keeps a recovery phrase typed into the page form out of the address', async () => {
    const history = createMemoryHistory({ initialEntries: ['/search'] })
    const visited = recordVisits(history)
    render(<App history={history} />)
    const user = userEvent.setup()

    const box = await screen.findByRole('searchbox')
    await user.type(
      box,
      '"abandon ability able about above absent absorb abstract absurd abuse access accident"{Enter}',
    )

    expect(
      await screen.findByText('That looks like a private key or recovery phrase'),
    ).toBeInTheDocument()
    expect(box).toHaveValue(
      '"abandon ability able about above absent absorb abstract absurd abuse access accident"',
    )
    expect(visited.join()).not.toContain('abandon')
  })

  it('keeps a partly typed phrase out of the address and the title', async () => {
    const history = createMemoryHistory({ initialEntries: ['/search'] })
    const visited = recordVisits(history)
    render(<App history={history} />)
    const user = userEvent.setup()

    const box = await screen.findByRole('searchbox')
    await user.type(box, 'abandon ability able about above{Enter}')

    expect(await screen.findByText('That could be part of a recovery phrase')).toBeInTheDocument()
    expect(box).toHaveValue('abandon ability able about above')
    expect(visited.join()).not.toContain('abandon')
    expect(document.title).not.toContain('abandon')
  })

  it.each(['Gold Coin Token', 'real estate token', 'abandon ability able about'])(
    'sends %s to the address like any other text',
    async (text) => {
      const history = createMemoryHistory({ initialEntries: ['/search'] })
      render(<App history={history} />)
      const user = userEvent.setup()

      await user.type(await screen.findByRole('searchbox'), `${text}{Enter}`)

      await waitFor(() => expect(decodeURIComponent(history.location.search)).toContain(text))
      expect(screen.queryByText(/part of a recovery phrase/)).not.toBeInTheDocument()
    },
  )

  it('searches ordinary text as before', async () => {
    const history = createMemoryHistory({ initialEntries: ['/search'] })
    render(<App history={history} />)
    const user = userEvent.setup()

    await user.type(await screen.findByRole('searchbox'), 'pshenmic.dash{Enter}')

    await waitFor(() => expect(history.location.search).toContain('pshenmic.dash'))
  })
})
