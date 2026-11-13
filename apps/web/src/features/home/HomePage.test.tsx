import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type * as ClientModule from '@/data/core/client'
import { core } from '@/data/core/client'
import { coreLive, type LiveTxEvent } from '@/data/core/live'
import { healthRegistry } from '@/data/health'
import { writeSourceMode } from '@/lib/source-mode'
import { resetLiveConnection, setLiveConnection } from '@/ui'
import { renderAt } from './test-utils'

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

const cardTitles = (section: Element) =>
  [...section.querySelectorAll('.rx-home__lists h3')].map((h) => h.textContent)

const section = (id: 'core' | 'platform') => document.querySelector<HTMLElement>(`#${id}`)!

/** The marks in a section's one source line. */
const lineMarks = (within: string, source: string) =>
  document.querySelectorAll(`${within} [data-home-sources] [data-source="${source}"]`)

const TESTNET_TX = '92fe2c05fde07f7cb7d1e2189b352e2003f76b536e6b81d78458ac096c1e9cf6'

const realChainLock = () => core.chainLock('mainnet')

describe('Home page', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    resetLiveConnection()
    writeSourceMode('all')
  })

  it("shows the Core tip with its ChainLock, its own source mark and the hero's source line @IN-01", async () => {
    renderAt('/')
    const row = await coreRow('2,570,085')
    await waitFor(() => expect(row).toHaveTextContent('ChainLocked'))
    expect(row.querySelector('.rx-fig__src [data-source="dapi"]')).not.toBeNull()
    expect(lineMarks('.rx-hero', 'dapi')).toHaveLength(1)
  })

  it('opens on one claim built from the crawl, with the day-over-day change @RA-01 @IN-01', async () => {
    renderAt('/')
    const claim = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('h1 [data-census-claim]')
      expect(el).toHaveTextContent('2,581 Dash nodes answered the last crawl')
      return el!
    })
    expect(claim.closest('h1')).toHaveTextContent(/^Radar:/)
    expect(document.querySelector('[data-census-lede]')).toHaveTextContent(
      /Among them [\d,]+ of the [\d,]+ enabled masternodes, 1 node fewer than a day ago\./,
    )
    expect(document.querySelectorAll('h1')).toHaveLength(1)
  })

  it('names each source once per section, and no card repeats it @IN-09', async () => {
    renderAt('/')
    await coreRow('2,570,085')
    await screen.findByRole('table', { name: 'Pending transactions' })
    await screen.findByRole('table', { name: /Latest Platform transitions/ })
    await waitFor(() => expect(lineMarks('#core', 'hyphen')).toHaveLength(1))
    for (const [where, source] of [
      ['.rx-hero', 'radar'],
      ['.rx-hero', 'dapi'],
      ['#core', 'dapi'],
      ['#platform', 'pe'],
    ] as const) {
      expect(lineMarks(where, source), `${source} in ${where}`).toHaveLength(1)
    }
    await waitFor(() => expect(lineMarks('.rx-hero', 'sdk')).toHaveLength(1))
    for (const scope of ['.rx-hero', '#core', '#platform']) {
      expect(document.querySelectorAll(`${scope} [data-home-sources]`), scope).toHaveLength(1)
    }
    expect(document.querySelector('.rx-home .rx-card__head [data-source]')).toBeNull()
  })

  it("states each figure once: the Core height is the hero's, not a Core figure @HY-01", async () => {
    renderAt('/')
    await coreRow('2,570,085')
    const headline = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('#core [data-headline]')
      expect(el).toHaveTextContent('Blockchain size')
      return el!
    })
    for (const label of ['Difficulty', 'Circulating supply', 'Blockchain size']) {
      expect(headline).toHaveTextContent(label)
    }
    expect(headline).not.toHaveTextContent('Height')
    expect(headline).not.toHaveTextContent('2,570,085')
    expect(document.querySelectorAll('[data-headline]')).toHaveLength(1)
    expect(document.querySelectorAll('[data-pulse="core"]')).toHaveLength(1)
  })

  it('draws the hero, Dash Core and Dash Platform in that order in the page @IN-01 @HY-18', async () => {
    renderAt('/')
    await coreRow('2,570,085')
    const follows = (a: Element, b: Element) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    const hero = document.querySelector('.rx-hero')!
    expect(follows(hero, section('core'))).toBe(true)
    expect(follows(section('core'), section('platform'))).toBe(true)
    expect([...document.querySelectorAll('.rx-home h2')].map((h) => h.textContent)).toEqual([
      'Dash Core',
      'Dash Platform',
    ])
  })

  it('lists the Core blocks, then the pending transactions, in the Dash Core section @IN-01 @HY-03', async () => {
    renderAt('/')
    await coreRow('2,570,085')
    const core = section('core')
    expect(cardTitles(core)).toEqual(['Core blocks', 'Pending transactions'])
    const pending = await within(core).findByRole('table', { name: 'Pending transactions' })
    await waitFor(() => expect(within(pending).getAllByRole('row').length).toBeGreaterThan(1))
    expect(within(pending).getAllByRole('row').length).toBeLessThanOrEqual(9)
    expect(within(pending).getByRole('columnheader', { name: 'Size' })).toBeInTheDocument()
    expect(within(core).getByRole('link', { name: 'Mempool' })).toHaveAttribute('href', '/mempool')
    expect(within(core).getByRole('link', { name: 'Charts' })).toHaveAttribute('href', '/charts')
  })

  it("carries each Core block row's detail: transactions, size and the reported pool @IN-01 @HY-03", async () => {
    renderAt('/')
    await coreRow('2,570,085')
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

  it('lists the Platform transitions beside the Platform blocks, each block with the Core block it is locked to @IN-01', async () => {
    renderAt('/')
    const platform = await waitFor(() => {
      expect(section('platform')).not.toBeNull()
      return section('platform')
    })
    expect(cardTitles(platform)).toEqual(['Platform transitions', 'Platform blocks'])
    expect(platform).toHaveTextContent('Each Platform block is locked to a Core block.')
    const blocks = await within(platform).findByRole('table', { name: 'Latest Platform blocks' })
    await waitFor(() => expect(within(blocks).getAllByRole('row').length).toBeGreaterThan(1))
    expect(
      within(blocks).getByRole('columnheader', { name: 'Locked to Core block' }),
    ).toBeInTheDocument()
    const first = within(blocks).getAllByRole('row')[1]!
    expect(first.querySelector('a[href^="/platform/block/"]')).not.toBeNull()
    expect(first.querySelector('a[href^="/block/"]')).not.toBeNull()
  })

  it('pauses the Core lists and counts what arrived meanwhile @IN-01', async () => {
    const user = userEvent.setup()
    renderAt('/')
    await coreRow('2,570,085')
    const control = () => document.querySelector<HTMLElement>('#core .rx-live')!
    await user.click(within(control()).getByRole('button', { name: 'Pause block updates' }))
    expect(control()).toHaveTextContent('Paused')
    await user.click(within(control()).getByRole('button', { name: 'Resume block updates' }))
    expect(control()).toHaveTextContent('Live')
  })

  it('shows the Core height and difficulty as soon as the status answers, without the tip @HY-01 @IN-01', async () => {
    vi.spyOn(core, 'tip').mockImplementation(() => new Promise(() => undefined))
    renderAt('/')
    const height = await coreRow('2,570,085')
    expect(height.querySelector('[data-source="dapi"]')).not.toBeNull()
    const headline = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('[data-headline]')
      expect(el).toHaveTextContent(/Difficulty.*106,426,839\.80/)
      return el!
    })
    expect(headline.querySelector('[data-source="dapi"]')).not.toBeNull()
    expect(lineMarks('#core', 'dapi')).toHaveLength(1)
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
    expect(blocks.querySelector('.rx-lock')).toBeNull()
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

  it('shows the share of masternodes answering from Radar, toned by how many answered @IN-01', async () => {
    renderAt('/')
    const row = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('[data-pulse="census"]')
      expect(el).toHaveTextContent(/\d+(\.\d)?%/)
      return el!
    })
    expect(row).toHaveAttribute('data-tone', 'good')
    expect(row).toHaveTextContent(/[\d,]+ didn't answer/)
    expect(row.querySelector('[data-source="radar"]')).not.toBeNull()
    expect(lineMarks('.rx-hero', 'radar')).toHaveLength(1)
  })

  it('links to the Core 24 tracker while it is pending @RA-11', async () => {
    renderAt('/')
    const link = await waitFor(() => {
      const el = document.querySelector<HTMLAnchorElement>('.rx-hero [data-v24-link]')
      expect(el).not.toBeNull()
      return el!
    })
    expect(link).toHaveAttribute('href', '/v24')
    expect(link).toHaveAccessibleName('Core 24 activation')
  })

  it('draws the masternode map from the crawl, with each place named in its tooltip and nothing over the map @IN-01', async () => {
    renderAt('/')
    const map = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('[data-map="nodes"]')
      expect(el).not.toBeNull()
      return el!
    })
    expect(map.querySelectorAll('circle.mn').length).toBeGreaterThan(10)
    expect(map.querySelector('.rx-callout')).toBeNull()
    expect(map.querySelector('svg title')).toHaveTextContent(/\S: [\d,]+ masternodes/)
    expect(map.querySelector('[data-source="radar"]')).not.toBeNull()
    expect(screen.queryByText(/not loaded yet|Arrives with/)).toBeNull()
  })

  it('keys the map: filled for masternodes, hollow for other reachable nodes, beside the count @HY-18', async () => {
    renderAt('/')
    const legend = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('.rx-maplegend .rx-maplegend__sum')
      expect(el).not.toBeNull()
      return el!.closest<HTMLElement>('.rx-maplegend')!
    })
    const keys = legend.querySelectorAll('.rx-maplegend__key')
    expect(keys).toHaveLength(2)
    expect(keys[0]!.querySelector('i.d')).not.toBeNull()
    expect(keys[0]!.querySelector('i.d--all')).toBeNull()
    expect(keys[1]!.querySelector('i.d.d--all')).not.toBeNull()
    expect(keys[0]).toHaveTextContent(/masternodes in/)
    expect(keys[1]).toHaveTextContent('Other reachable nodes')
    expect(legend.querySelector('.rx-maplegend__sum')).toHaveTextContent(/masternodes in/)
  })

  it('dates the crawl in the present, not centuries ahead @IN-01', async () => {
    renderAt('/')
    const crawled = await waitFor(() => {
      const el = document.querySelector<HTMLTimeElement>(
        '.rx-hero [data-home-sources] [data-source="radar"] time',
      )
      expect(el).not.toBeNull()
      return el!
    })
    expect(crawled.closest('[data-source]')).toHaveTextContent(/Crawled by Radar/)
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
    const lanes = () => document.querySelector<HTMLElement>('#core .rx-live')!
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
    expect(headline).toHaveTextContent('Difficulty')
    expect(headline).not.toHaveTextContent('Circulating supply')
    expect(document.querySelector('[data-pulse="core"] time')).not.toBeNull()
    const note = await screen.findByRole('note')
    expect(note).toHaveTextContent(/Supply and blockchain size are not shown until it catches up/)
    expect(note).toHaveTextContent(/See the sources/)
    expect(note).toHaveTextContent(
      /Testnet index is behind the chain: indexed to block [\d,]+ \(.+ behind\)/,
    )
    expect(lineMarks('#core', 'dapi')).toHaveLength(1)
    expect(lineMarks('#core', 'hyphen')).toHaveLength(0)
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
      [...document.querySelectorAll('#core .rx-home__lists .rx-card')].find((c) =>
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
    expect(lineMarks('#core', 'dapi')).toHaveLength(1)
    expect(lineMarks('#core', 'hyphen')).toHaveLength(0)
    act(() => deliver?.({ kind: 'block', txids: [tx.txid] }))
    await waitFor(() => expect(find()).toHaveTextContent('Nothing seen yet'))
  })

  it('lists the newest eight once the feed has delivered more transactions than the seen list hands out @HY-19 @HY-03', async () => {
    let deliver: ((e: LiveTxEvent) => void) | undefined
    vi.spyOn(coreLive, 'transactions').mockImplementation((_net, listener) => {
      deliver = listener
      return () => undefined
    })
    vi.spyOn(coreLive, 'txStatus').mockReturnValue({ state: 'live', fallbackHint: false })
    renderAt('/?network=testnet')
    await coreRow('1,589,232')
    const tx = { ...(await core.tx('testnet', TESTNET_TX)).data!, height: undefined }
    act(() => {
      for (let i = 0; i < 25; i++) {
        deliver?.({ kind: 'tx', tx: { ...tx, txid: i.toString(16).padStart(64, '0') } })
      }
    })
    const table = await screen.findByRole('table', {
      name: 'Pending transactions seen since you opened this page',
    })
    expect(within(table).getAllByRole('row')).toHaveLength(9)
  })

  it('works on testnet and names the network @IN-16 @HY-19', async () => {
    renderAt('/?network=testnet')
    await coreRow('1,589,232')
    expect(document.querySelector('[data-net]')).toHaveTextContent(/testnet/i)
  })

  it('keeps its shape in Decentralized only mode: the chain figures, one note per section and no empty cells @X-05', async () => {
    renderAt('/?sources=decentralized')
    await coreRow('2,570,085')
    const hero = document.querySelector<HTMLElement>('.rx-hero')!
    expect(within(hero).getByRole('heading', { level: 1 })).toHaveTextContent(
      'The Dash network, now',
    )
    expect(hero.querySelector('[data-pulse="census"]')).toBeNull()
    expect(hero.querySelectorAll('.rx-fig')).toHaveLength(2)
    expect(hero.querySelectorAll('[data-unavailable="mode"]')).toHaveLength(1)
    expect(hero.querySelector('[data-map="land"]')).not.toBeNull()
    expect(lineMarks('.rx-hero', 'radar')).toHaveLength(0)
    await waitFor(() => expect(lineMarks('.rx-hero', 'sdk')).toHaveLength(1))
    const platform = section('platform')
    expect(platform.querySelectorAll('[data-unavailable="mode"]')).toHaveLength(1)
    expect(platform.querySelector('.rx-card')).toBeNull()
    const core = section('core')
    expect(core.querySelector('[data-headline]')).toHaveTextContent('Best ChainLock')
    expect(lineMarks('#core', 'hyphen')).toHaveLength(0)
    await within(core).findByRole('table', { name: 'Latest Core blocks' })
    for (const fig of document.querySelectorAll('.rx-home .rx-fig__value')) {
      expect(fig.textContent, 'no figure is an empty cell').toMatch(/\d/)
    }
  })
})
