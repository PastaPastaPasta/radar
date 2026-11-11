import { act, configure, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type * as ClientModule from '@/data/core/client'
import { core } from '@/data/core/client'
import { healthRegistry } from '@/data/health'
import { resetLiveConnection, setLiveConnection } from '@/ui'
import { renderAt } from './test-utils'

configure({ asyncUtilTimeout: 5000 })
vi.setConfig({ testTimeout: 15000 })

vi.mock('@/data/core/client', async (original) => {
  const actual = await original<typeof ClientModule>()
  const { fixtureCore } = await import('@/test/core-client')
  return { ...actual, core: fixtureCore().core }
})

function coreRow(height: string): Promise<HTMLElement> {
  return waitFor(() => {
    const el = document.querySelector<HTMLElement>('[data-pulse="core"]')
    expect(el).toHaveTextContent(height)
    return el!
  })
}

const realChainLock = () => core.chainLock('mainnet')

describe('Home page', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    resetLiveConnection()
  })

  it('shows the Core tip with its ChainLock and a source line @IN-01', async () => {
    renderAt('/')
    const row = await coreRow('2,570,085')
    await waitFor(() => expect(row).toHaveTextContent('ChainLocked'))
    expect(row.querySelector('[data-source="dapi"]')).not.toBeNull()
  })

  it('shows the Core height and difficulty as soon as the status answers, without the tip @HY-01 @IN-01', async () => {
    vi.spyOn(core, 'tip').mockImplementation(() => new Promise(() => undefined))
    renderAt('/')
    const headline = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('[data-headline]')
      expect(el).toHaveTextContent(/Height.*2,570,085/)
      return el!
    })
    expect(headline).toHaveTextContent(/Difficulty.*106,426,840/)
    expect(headline.querySelector('[data-source="dapi"]')).not.toBeNull()
  })

  it('offers a jump to the Core figures from the top of the page @HY-01', async () => {
    renderAt('/')
    const link = await screen.findByRole('link', { name: 'Core figures' })
    expect(link).toHaveAttribute('href', '#core')
    expect(document.getElementById('core')).not.toBeNull()
  })

  it('says one node reported a ChainLock on the home lists instead of drawing a lock @IN-01', async () => {
    const original = core.blockRows.bind(core)
    vi.spyOn(core, 'blockRows').mockImplementation(async (net, q, signal) => {
      const rows = await original(net, q, signal)
      return {
        ...rows,
        data: rows.data.map((r) => ({
          ...r,
          chainLocked: false,
          chainLockClaim: 'one-node' as const,
        })),
      }
    })
    const lock = await realChainLock()
    vi.spyOn(core, 'chainLock').mockResolvedValue({
      ...lock,
      data: { ...lock.data, claim: 'one-node' as const },
    })
    renderAt('/')
    const row = await coreRow('2,570,085')
    await waitFor(() => expect(row).toHaveTextContent('reported by one node'))
    expect(row).not.toHaveTextContent(/ChainLocked/)
    const blocks = await screen.findByRole('table', { name: 'Latest Core blocks' })
    await waitFor(() =>
      expect(within(blocks).getAllByText('ChainLock reported by one node').length).toBeGreaterThan(
        5,
      ),
    )
    const lane = document.querySelector('#lane-core')!
    await waitFor(() =>
      expect(lane.querySelectorAll('[data-claim="one-node"]').length).toBeGreaterThan(3),
    )
    expect(lane.querySelector('.rx-lock')).toBeNull()
    vi.restoreAllMocks()
  })

  it('lists the latest Core blocks and Platform transitions @IN-01', async () => {
    renderAt('/')
    const blocks = await screen.findByRole('table', { name: 'Latest Core blocks' })
    await waitFor(() => expect(within(blocks).getAllByRole('row').length).toBeGreaterThan(5))
    expect(within(blocks).getByRole('link', { name: /2,570,085/ })).toBeInTheDocument()
    const transitions = await screen.findByRole('table', { name: /Latest Platform transitions/ })
    await waitFor(() => expect(within(transitions).getAllByRole('row').length).toBeGreaterThan(1))
  })

  it('shows the Platform height and epoch from the proof-checked SDK answer @IN-01', async () => {
    renderAt('/')
    const row = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('[data-pulse="platform"]')
      expect(el).toHaveTextContent(/Epoch \d+/)
      expect(el!.querySelector('[data-source="sdk"]')).not.toBeNull()
      return el!
    })
    expect(row.querySelector('[data-source="pe"]')).toBeNull()
  })

  it('shows the census headline from Radar @IN-01', async () => {
    renderAt('/')
    const row = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('[data-pulse="census"]')
      expect(el).toHaveTextContent(/\d[\d,]* of \d[\d,]*/)
      return el!
    })
    expect(row.querySelector('[data-source="radar"]')).not.toBeNull()
  })

  it('draws the masternode map from the crawl, with the busiest place called out @IN-01', async () => {
    renderAt('/')
    const map = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('[data-map="nodes"]')
      expect(el).not.toBeNull()
      return el!
    })
    expect(map.querySelectorAll('circle.mn').length).toBeGreaterThan(10)
    expect(map.querySelector('.rx-callout')).toHaveTextContent(/masternodes/)
    expect(map.querySelector('[data-source="radar"]')).not.toBeNull()
    expect(screen.queryByText(/not loaded yet|Arrives with/)).toBeNull()
  })

  it('dates the crawl in the present, not centuries ahead @IN-01', async () => {
    renderAt('/')
    const row = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('[data-pulse="census"]')
      expect(el).not.toBeNull()
      expect(el!.querySelector('.rx-pulse__meta time')).not.toBeNull()
      return el!
    })
    const crawled = row.querySelector<HTMLTimeElement>('.rx-pulse__meta time')!
    const years = Math.abs(Date.now() - Date.parse(crawled.dateTime)) / (365 * 86_400_000)
    expect(years).toBeLessThan(5)
    expect(crawled.title).not.toMatch(/\d{5}/)
  })

  it('keeps the current Core height and its ChainLock in the header @IN-15', async () => {
    renderAt('/')
    const tip = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('[data-header-tip]')
      expect(el).toHaveTextContent('2,570,085')
      return el!
    })
    await waitFor(() => expect(tip).toHaveTextContent('ChainLocked'))
    expect(tip.querySelector('.rx-hdrtip__lock')).not.toBeNull()
    expect(tip).toHaveAttribute('data-connection', 'live')
  })

  it('does not draw the header lock for a ChainLock only one node reports @IN-15', async () => {
    const lock = await realChainLock()
    vi.spyOn(core, 'chainLock').mockResolvedValue({
      ...lock,
      data: { ...lock.data, height: 2_570_085, claim: 'one-node' as const },
    })
    renderAt('/')
    const tip = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('[data-header-tip]')
      expect(el).toHaveTextContent('2,570,085')
      return el!
    })
    await waitFor(() => expect(tip).toHaveTextContent('ChainLock reported by one node'))
    expect(tip.querySelector('.rx-hdrtip__lock')).toBeNull()
    expect(tip).not.toHaveTextContent('ChainLocked')
  })

  it('does not call a corroborated ChainLock below the tip a claim on the Core row @IN-01', async () => {
    const original = core.blockRows.bind(core)
    vi.spyOn(core, 'blockRows').mockImplementation(async (net, q, signal) => {
      const rows = await original(net, q, signal)
      return { ...rows, data: rows.data.map((r) => ({ ...r, chainLocked: false })) }
    })
    renderAt('/')
    const row = await coreRow('2,570,085')
    await screen.findByRole('table', { name: 'Latest Core blocks' })
    expect(row).not.toHaveTextContent(/ChainLock/)
  })

  it('qualifies every Live when the connection drops, and recovers @IN-15', async () => {
    renderAt('/')
    await coreRow('2,570,085')
    const kicker = () => document.querySelector<HTMLElement>('[data-live-word]')!
    const lanes = () => document.querySelector<HTMLElement>('.rx-lanes .rx-live')!
    const tip = () => document.querySelector<HTMLElement>('[data-header-tip]')!
    expect(kicker()).toHaveTextContent('Live')
    act(() => setLiveConnection({ state: 'reconnecting', lastEventAt: Date.now() }))
    expect(kicker()).toHaveTextContent('Reconnecting…')
    expect(lanes()).toHaveTextContent('Reconnecting…')
    expect(tip()).toHaveTextContent('Reconnecting…')
    act(() => setLiveConnection({ state: 'stopped', lastEventAt: Date.UTC(2026, 10, 11, 9, 41) }))
    expect(kicker()).toHaveTextContent(/Stopped since \d\d:\d\d/)
    expect(lanes()).toHaveTextContent(/Stopped since/)
    expect(tip()).toHaveTextContent(/Stopped since/)
    expect(tip()).toHaveAttribute('data-up', 'false')
    act(() => setLiveConnection({ state: 'live' }))
    expect(kicker()).toHaveTextContent('Live')
    expect(lanes()).not.toHaveTextContent(/Stopped|Reconnecting/)
    expect(tip().querySelector('.rx-hdrtip__state')).toBeNull()
  })

  it('says live updates stopped when the Core connection is down, and offers a retry @IN-15', async () => {
    const user = userEvent.setup()
    renderAt('/')
    await coreRow('2,570,085')
    expect(document.querySelector('[data-live-notice]')).toBeNull()
    act(() => {
      for (let i = 0; i < 3; i++) {
        healthRegistry.report('mainnet', 'dapi', { ok: false, kind: 'network', message: 'down' })
      }
    })
    const notice = await screen.findByRole('status')
    expect(notice).toHaveTextContent('Live updates have stopped.')
    expect(within(notice).getByRole('button', { name: 'Try again' })).toBeEnabled()
    await user.click(within(notice).getByRole('button', { name: 'Try again' }))
  })

  it('shows DAPI-backed testnet figures and says what is stale and by how much while Hyphen trails @IN-16 @HY-19', async () => {
    renderAt('/?network=testnet')
    await coreRow('1,589,232')
    const headline = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('[data-headline]')
      expect(el).toHaveTextContent('Best ChainLock')
      return el!
    })
    expect(headline).toHaveTextContent('Last block')
    expect(headline).not.toHaveTextContent('Circulating supply')
    const note = await screen.findByRole('note')
    expect(note).toHaveTextContent(
      /Supply, blockchain size and pending transactions come only from Hyphen/,
    )
    expect(note).toHaveTextContent(
      /Testnet index is behind the chain: indexed to block [\d,]+ \(.+ behind\)/,
    )
    expect(headline.querySelectorAll('[data-source="dapi"]').length).toBe(1)
  })

  it('words a one-node best ChainLock as a claim on the stale-Hyphen headline @IN-16', async () => {
    const lock = await core.chainLock('testnet')
    vi.spyOn(core, 'chainLock').mockResolvedValue({
      ...lock,
      data: { ...lock.data, claim: 'one-node' as const },
    })
    renderAt('/?network=testnet')
    await coreRow('1,589,232')
    const headline = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('[data-headline]')
      expect(el).toHaveTextContent('Best ChainLock')
      return el!
    })
    await waitFor(() => expect(headline).toHaveTextContent('ChainLock reported by one node'))
  })

  it('works on testnet and names the network @IN-16 @HY-19', async () => {
    renderAt('/?network=testnet')
    await coreRow('1,589,232')
    expect(document.querySelector('[data-net]')).toHaveTextContent(/testnet/i)
  })
})
