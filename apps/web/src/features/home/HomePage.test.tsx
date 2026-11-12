import { act, configure, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type * as ClientModule from '@/data/core/client'
import { core } from '@/data/core/client'
import { coreLive, type LiveTxEvent } from '@/data/core/live'
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

const gridTitles = (activity: Element) =>
  [...activity.querySelectorAll('.rx-activity__grid h3')].map((h) => h.textContent)

const TESTNET_TX = '92fe2c05fde07f7cb7d1e2189b352e2003f76b536e6b81d78458ac096c1e9cf6'

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

  it('lists the pending transactions beside the block lists, in the same section and after them in reading order @IN-01 @HY-03', async () => {
    renderAt('/')
    await coreRow('2,570,085')
    const activity = document.querySelector<HTMLElement>('.rx-home__activity')!
    expect(document.querySelector('#core')).toBeNull()
    expect(gridTitles(activity)).toEqual([
      'Core blocks',
      'Platform transitions',
      'Pending transactions',
    ])
    const pending = await within(activity).findByRole('table', { name: 'Pending transactions' })
    await waitFor(() => expect(within(pending).getAllByRole('row').length).toBeGreaterThan(1))
    expect(within(pending).getAllByRole('row').length).toBeLessThanOrEqual(9)
    expect(within(activity).getByRole('link', { name: 'Mempool' })).toHaveAttribute(
      'href',
      '/mempool',
    )
  })

  describe('by width @IN-01 @HY-03', () => {
    afterEach(() => vi.unstubAllGlobals())
    const width = (matching: readonly string[]) =>
      vi.stubGlobal(
        'matchMedia',
        (query: string): MediaQueryList =>
          ({
            matches: matching.includes(query),
            media: query,
            addEventListener: () => undefined,
            removeEventListener: () => undefined,
            addListener: () => undefined,
            removeListener: () => undefined,
            dispatchEvent: () => false,
            onchange: null,
          }) as MediaQueryList,
      )
    const follows = (a: Element, b: Element) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

    it('puts the pending band between the hero and the block lists on a phone, in the page and not by CSS', async () => {
      width(['(max-width: 640px)'])
      renderAt('/')
      await coreRow('2,570,085')
      const activity = document.querySelector('.rx-home__activity')!
      const band = document.querySelector('#core')!
      expect(follows(document.querySelector('.rx-scope')!, band)).toBe(true)
      expect(follows(band, activity)).toBe(true)
      expect(gridTitles(activity)).toEqual(['Core blocks', 'Platform transitions'])
      expect(band).toHaveTextContent('Pending transactions')
    })

    it('shows the newest Core height once on a phone: in the card, not again as the first chip @IN-01 @HY-01', async () => {
      width(['(max-width: 640px)'])
      renderAt('/')
      await coreRow('2,570,085')
      const lane = document.querySelector('#lane-core')!
      await waitFor(() => expect(lane.querySelectorAll('a.rx-blk').length).toBeGreaterThan(0))
      const heights = [...lane.querySelectorAll<HTMLElement>('a.rx-blk')].map((a) =>
        Number(a.dataset.h),
      )
      expect(heights).not.toContain(2570085)
      expect(Math.max(...heights)).toBe(2570084)
      expect(heights).toHaveLength(8)
    })

    it.each(['(min-width: 1024px)', null] as const)(
      'keeps the newest Core block as the last chip beyond a phone (%s) @IN-01',
      async (query) => {
        width(query ? [query] : [])
        renderAt('/')
        await coreRow('2,570,085')
        const lane = document.querySelector('#lane-core')!
        await waitFor(() => expect(lane.querySelector('a.rx-blk.is-tip')).not.toBeNull())
        expect(lane.querySelector<HTMLElement>('a.rx-blk.is-tip')!.dataset.h).toBe('2570085')
      },
    )

    it('keeps the four pending columns when the pending list sits full width on a tablet', async () => {
      width([])
      renderAt('/')
      await coreRow('2,570,085')
      expect(document.querySelector('#core')).toBeNull()
      const pending = await screen.findByRole('table', { name: 'Pending transactions' })
      expect(within(pending).getByRole('columnheader', { name: 'Size' })).toBeInTheDocument()
    })

    it('mounts the three-column tree from 1024 px, each row carrying its detail', async () => {
      width(['(min-width: 1024px)'])
      renderAt('/')
      await coreRow('2,570,085')
      expect(document.querySelector('#core')).toBeNull()
      const pending = await screen.findByRole('table', { name: 'Pending transactions' })
      expect(within(pending).getByRole('columnheader', { name: 'Size' })).toBeInTheDocument()
      const blocks = await screen.findByRole('table', { name: 'Latest Core blocks' })
      await waitFor(() => expect(within(blocks).getAllByRole('row').length).toBeGreaterThan(1))
      for (const name of ['Txs', 'Size', 'Mined by']) {
        expect(within(blocks).getByRole('columnheader', { name })).toBeInTheDocument()
      }
      const first = within(blocks).getAllByRole('row')[1]!
      expect(first.querySelector('td[data-u="tx"]')).toHaveTextContent('9')
      expect(first.querySelector('td[data-l="Mined by"]')).toHaveTextContent(/\S/)
      expect(first).toHaveTextContent(/\d(\.\d)? kB/)
    })

    it('links the charts from the activity header beyond a phone', async () => {
      width(['(min-width: 1024px)'])
      renderAt('/')
      await coreRow('2,570,085')
      const head = document.querySelector<HTMLElement>('.rx-activity .rx-sec__head')!
      expect(within(head).getByRole('link', { name: 'Charts' })).toHaveAttribute('href', '/charts')
    })

    it('keeps the charts link in the Dash Core band on a phone and out of the activity header', async () => {
      width(['(max-width: 640px)'])
      renderAt('/')
      await coreRow('2,570,085')
      expect(document.querySelector('.rx-activity .rx-sec__head a')).toBeNull()
      const band = document.querySelector<HTMLElement>('#core')!
      expect(within(band).getByRole('link', { name: 'Charts' })).toBeInTheDocument()
    })
  })

  it('shows the Core height and difficulty as soon as the status answers, without the tip @HY-01 @IN-01', async () => {
    vi.spyOn(core, 'tip').mockImplementation(() => new Promise(() => undefined))
    renderAt('/')
    const headline = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('[data-headline]')
      expect(el).toHaveTextContent(/Height.*2,570,085/)
      return el!
    })
    expect(headline).toHaveTextContent(/Difficulty.*106,426,839\.80/)
    expect(headline.querySelector('[data-source="dapi"]')).not.toBeNull()
  })

  it('keeps the digits of a difficulty below one @IN-16', async () => {
    const original = core.status.bind(core)
    vi.spyOn(core, 'status').mockImplementation(async (net, signal) => {
      const status = await original(net, signal)
      return { ...status, data: { ...status.data, difficulty: 0.00123456 } }
    })
    renderAt('/')
    const headline = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('[data-headline]')
      expect(el).toHaveTextContent(/Difficulty.*0\.001235/)
      return el!
    })
    expect(headline).not.toHaveTextContent(/Difficulty\s*0(?!\.)/)
  })

  it('offers a jump to the Core figures from the top of the page @HY-01', async () => {
    renderAt('/')
    const link = await screen.findByRole('link', { name: 'Core figures' })
    expect(link).toHaveAttribute('href', '#core-figures')
    expect(document.getElementById('core-figures')).not.toBeNull()
  })

  it('shows the Core headline figures inside the hero plate, ahead of the lanes @HY-01 @HY-03', async () => {
    renderAt('/')
    const headline = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('.rx-scope [data-headline]')
      expect(el).not.toBeNull()
      return el!
    })
    for (const label of ['Height', 'Difficulty', 'Circulating supply', 'Blockchain size']) {
      expect(headline).toHaveTextContent(label)
    }
    const lanes = document.querySelector('.rx-scope .rx-lanes')!
    expect(
      headline.compareDocumentPosition(lanes) & Node.DOCUMENT_POSITION_FOLLOWING,
      'headline precedes the lanes',
    ).toBeTruthy()
    expect(document.querySelectorAll('[data-headline]')).toHaveLength(1)
    expect(
      document.querySelector('.rx-home__activity [data-headline]'),
      'no second headline in the activity',
    ).toBeNull()
  })

  it('keeps the Platform-locked-to-Core line on the lane title for phones @IN-01', async () => {
    renderAt('/')
    const title = await screen.findByRole('heading', { name: 'Latest blocks' })
    expect(title).toHaveAttribute('title', 'Each Platform block is locked to a Core block.')
    expect(document.querySelector('.rx-lanes__short')).toHaveTextContent('Platform locks to Core')
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

  it('keys the map: filled for masternodes, hollow for other reachable nodes, beside the count @HY-18', async () => {
    renderAt('/')
    const legend = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('.rx-maplegend .rx-maplegend__sum')
      expect(el).not.toBeNull()
      return el!.parentElement!
    })
    const keys = legend.querySelectorAll('.rx-maplegend__key')
    expect(keys).toHaveLength(2)
    expect(keys[0]!.querySelector('i.d')).not.toBeNull()
    expect(keys[0]!.querySelector('i.d--all')).toBeNull()
    expect(keys[1]!.querySelector('i.d.d--all')).not.toBeNull()
    expect(keys[0]).toHaveTextContent('Masternodes')
    expect(keys[1]).toHaveTextContent('Other reachable nodes')
    expect(legend.querySelector('.rx-maplegend__sum')).toHaveTextContent(/masternodes in/)
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
    const lock = await realChainLock()
    vi.spyOn(core, 'chainLock').mockResolvedValue({
      ...lock,
      data: { ...lock.data, height: lock.data.height - 1 },
    })
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

  it.each([
    ['mainnet', '/', '2,570,085'],
    ['testnet', '/?network=testnet', '1,589,232'],
  ] as const)(
    'keeps the ChainLock state on the %s Core row when the block rows were read before the lock arrived @IN-01',
    async (net, url, height) => {
      const original = core.blockRows.bind(core)
      vi.spyOn(core, 'blockRows').mockImplementation(async (n, q, signal) => {
        const rows = await original(n, q, signal)
        return { ...rows, data: rows.data.map((r) => ({ ...r, chainLocked: false })) }
      })
      const lock = await core.chainLock(net)
      const tip = await core.tip(net)
      vi.spyOn(core, 'chainLock').mockResolvedValue({
        ...lock,
        data: { height: tip.data.height, hash: tip.data.hash },
      })
      renderAt(url)
      const row = await coreRow(height)
      await waitFor(() => expect(row).toHaveTextContent('ChainLocked'))
      expect(row).not.toHaveTextContent('one node')
      expect(row.querySelector('.rx-ok .rx-icon, .rx-ok svg')).not.toBeNull()
    },
  )

  it('words a lock only one node reports as that on the Core row even when its block row has not heard of it @IN-01', async () => {
    const original = core.blockRows.bind(core)
    vi.spyOn(core, 'blockRows').mockImplementation(async (n, q, signal) => {
      const rows = await original(n, q, signal)
      return { ...rows, data: rows.data.map((r) => ({ ...r, chainLocked: false })) }
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
    expect(note).toHaveTextContent(/Supply and blockchain size are not shown until it catches up/)
    expect(note).toHaveTextContent(/See the sources/)
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

  it('fills the pending column from the live feed while Hyphen is behind, labelled as seen since the page opened, on testnet @IN-16 @HY-19 @HY-03', async () => {
    let deliver: ((e: LiveTxEvent) => void) | undefined
    vi.spyOn(coreLive, 'transactions').mockImplementation((_net, listener) => {
      deliver = listener
      return () => undefined
    })
    vi.spyOn(coreLive, 'txStatus').mockReturnValue({ state: 'live', fallbackHint: false })
    renderAt('/?network=testnet')
    await coreRow('1,589,232')
    const find = () =>
      [...document.querySelectorAll('.rx-activity__grid .rx-card')].find((c) =>
        c.textContent?.includes('Pending transactions'),
      ) as HTMLElement
    const column = await waitFor(() => {
      expect(find()).toHaveTextContent('Nothing seen yet')
      return find()
    })
    expect(column).not.toHaveTextContent('unavailable')
    const tx = { ...(await core.tx('testnet', TESTNET_TX)).data!, height: undefined }
    act(() => deliver?.({ kind: 'tx', tx }))
    const table = await within(find()).findByRole('table', {
      name: 'Pending transactions seen since you opened this page',
    })
    expect(within(table).getAllByRole('row')).toHaveLength(2)
    expect(find()).toHaveTextContent('Seen since you opened this page')
    expect(find().querySelector('[data-source="dapi"]')).not.toBeNull()
    act(() => deliver?.({ kind: 'block', txids: [tx.txid] }))
    await waitFor(() => expect(find()).toHaveTextContent('Nothing seen yet'))
  })

  it('works on testnet and names the network @IN-16 @HY-19', async () => {
    renderAt('/?network=testnet')
    await coreRow('1,589,232')
    expect(document.querySelector('[data-net]')).toHaveTextContent(/testnet/i)
  })
})
