import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as ClientModule from '@/data/core/client'
import { core } from '@/data/core/client'
import { server } from '@/test/server'
import { renderAt } from '../hy-shared/test-utils'

vi.mock('@/data/core/client', async (original) => {
  const actual = await original<typeof ClientModule>()
  const { fixtureCore } = await import('@/test/core-client')
  return { ...actual, core: fixtureCore().core }
})

const MAINNET = {
  transfer: '8acce06e01135b73f1acc26c8cb1084917e9bcf4a83ef1d1068df96a7c427a90',
  coinbase: 'ff1ebb495704b3ef38bc23c85076b3282af81bcc564c8aea492b0413ab290328',
  cbtx: 'ea25cc59f4fe3a7bac8873d0a722d995eb5ea37b47f1f83511bf2f1e888daae9',
  qctx: '4fa48aca80dfcf1e7fa0c59eb36e15ae7470195d79185a0b9fd3f4e5c10be76b',
  proreg: 'af68cf8494b8064085187efbb933c3a58b189ec9ef770510db7d791ea8d45251',
  proupserv: 'e788264d6b8e02fbb029503c43d568093e73d0119f639102410db46cc822eb51',
  proupreg: '188e7232b8f73723bb3d893a9ffd84cbdce20f859f4d42c312fad559a9fb11b7',
  uprevtx: '9f827f91edb38bffff9f4a324cde6f6c071f25d500e343401e99d028e8cb17d4',
  assetlock: '2972859ef7fdc7a52397b7f844d69888414e22dcaa2be2b6e432a81c7b812cf6',
  assetunlock: '5d0c5900e0e0d260c7b952f2cf0496d274d538c755b1f56e21a72f42c315a63a',
}
const MNHF = '46a47fe65c9fd29e9379f3f74020df33dabb1d4095c8da6b1fa05e508b74a491'
const TESTNET_NORMAL = '92fe2c05fde07f7cb7d1e2189b352e2003f76b536e6b81d78458ac096c1e9cf6'
/** Spends output 0 of `uprevtx`'s transaction in its own block-time neighbour; see the recorded Hyphen address history. */
const SPENT_SOURCE = MAINNET.uprevtx
const SPENDER = 'a1782604010574eeafc6c667602a6826832a6a9e3d9752b8b559a4732ea32cee'
const NO_SUCH = '0000000000000000000000000000000000000000000000000000000000000001'

async function payload(url: string, kind: string): Promise<HTMLElement> {
  renderAt(url)
  return waitFor(
    () => {
      const el = document.querySelector<HTMLElement>(`[data-payload="${kind}"]`)
      expect(el).not.toBeNull()
      return el!
    },
    { timeout: 4000 },
  )
}

const HASH = 'ab'.repeat(32)
const SIG = 'cd'.repeat(96)

describe('shared masternode payloads', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each([
    [
      'proDissolveTx',
      { version: 1, proTxHash: HASH, actorIndex: 2, signatures: [SIG] },
      'Share index',
    ],
    [
      'proUpShareTx',
      {
        version: 1,
        proTxHash: HASH,
        shareIndex: 1,
        scriptReward: null,
        inputsHash: HASH,
        payloadSig: SIG,
      },
      'New reward payout',
    ],
    [
      'proUpSharedRegTx',
      {
        version: 1,
        proTxHash: HASH,
        operatorPublicKey: SIG,
        votingKey: { address: null },
        inputsHash: HASH,
        signatures: [SIG],
      },
      'Operator public key',
    ],
  ])('shows the fields of a %s instead of only its name @IN-05', async (kind, fields, label) => {
    const original = core.tx.bind(core)
    vi.spyOn(core, 'tx').mockImplementation(async (net, txid, signal) => {
      const found = await original(net, txid, signal)
      return found.data
        ? { ...found, data: { ...found.data, payload: { kind, ...fields } } }
        : found
    })

    const el = await payload(`/tx/${MAINNET.uprevtx}`, kind)

    expect(within(el).getByText(label)).toBeInTheDocument()
    expect(within(el).queryByText('Raw payload')).toBeNull()
  })

  it.each([
    [{}, '—'],
    [{ reason: 'x' }, '—'],
    [{ reason: 0 }, 'Not specified (reason 0)'],
  ])('shows a revocation payload %j with its reason as %s @IN-05', async (fields, shown) => {
    const original = core.tx.bind(core)
    vi.spyOn(core, 'tx').mockImplementation(async (net, txid, signal) => {
      const found = await original(net, txid, signal)
      return found.data
        ? {
            ...found,
            data: {
              ...found.data,
              payload: { kind: 'proUpRevTx', version: 1, proTxHash: HASH, ...fields },
            },
          }
        : found
    })
    const el = await payload(`/tx/${MAINNET.uprevtx}`, 'proUpRevTx')
    const row = within(el).getByText('Reason').closest('div')!
    expect(row).toHaveTextContent(shown)
    if (shown === '—') expect(row).not.toHaveTextContent(/\(reason|Unknown reason/)
  })
})

describe('Transaction page', () => {
  it('shows a transfer with its fee, flow, settlement and inputs @IN-05 @HY-07', async () => {
    renderAt(`/tx/${MAINNET.transfer}`)
    expect(
      await screen.findByRole('heading', { level: 1, name: /Transaction/ }),
    ).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('Fee')).toBeInTheDocument(), { timeout: 4000 })
    expect(document.querySelector('#flow')).not.toBeNull()
    expect(document.querySelector('[data-step="chainlocked"]')).not.toBeNull()
    expect(document.querySelector('#in-0')).not.toBeNull()
    expect(document.querySelector('#out-0')).not.toBeNull()
    expect(document.querySelector('[data-source="dapi"]')).not.toBeNull()
  })

  it('shows the coinbase as a reward without a fee or inputs to trace @IN-05', async () => {
    renderAt(`/tx/${MAINNET.coinbase}`)
    expect(await screen.findByText('Coinbase transactions pay none')).toBeInTheDocument()
    expect(screen.queryByText('Something went wrong')).toBeNull()
  })

  it('renders a coinbase payload @IN-05 @HY-07', async () => {
    const el = await payload(`/tx/${MAINNET.cbtx}`, 'cbTx')
    expect(el).toHaveTextContent('Masternode list root')
    expect(el).toHaveTextContent('Best ChainLock')
  })

  it('renders a quorum commitment @IN-05 @HY-07', async () => {
    const el = await payload(`/tx/${MAINNET.qctx}`, 'qcTx')
    expect(el).toHaveTextContent('Quorum type')
    expect(el).toHaveTextContent('Signers')
  })

  it('renders a masternode registration @IN-05 @HY-07', async () => {
    const el = await payload(`/tx/${MAINNET.proreg}`, 'proRegTx')
    expect(el).toHaveTextContent('Service address')
    expect(el).toHaveTextContent('Collateral')
    expect(el).toHaveTextContent('Owner key')
  })

  it('renders a masternode service update @IN-05 @HY-07', async () => {
    const el = await payload(`/tx/${MAINNET.proupserv}`, 'proUpServTx')
    expect(el).toHaveTextContent('New service address')
  })

  it('renders a masternode registrar update @IN-05 @HY-07', async () => {
    const el = await payload(`/tx/${MAINNET.proupreg}`, 'proUpRegTx')
    expect(el).toHaveTextContent('New operator key')
    expect(el).toHaveTextContent('Owner signature')
  })

  it('renders a masternode revocation @IN-05 @HY-07', async () => {
    const el = await payload(`/tx/${MAINNET.uprevtx}`, 'proUpRevTx')
    expect(el).toHaveTextContent('Reason')
  })

  it('renders an asset lock @IN-05 @HY-07', async () => {
    const el = await payload(`/tx/${MAINNET.assetlock}`, 'assetLockTx')
    expect(el).toHaveTextContent('Credited on Platform')
  })

  it('renders an asset unlock @IN-05 @HY-07', async () => {
    const el = await payload(`/tx/${MAINNET.assetunlock}`, 'assetUnlockTx')
    expect(el).toHaveTextContent('Withdrawal index')
    expect(el).toHaveTextContent('Signing quorum')
  })

  it('renders a hard-fork signal on testnet @IN-05 @HY-07 @IN-16', async () => {
    const el = await payload(`/tx/${MNHF}?network=testnet`, 'mnhfTx')
    expect(el).toHaveTextContent('Version bit')
  })

  describe('transactions that spend nothing @HY-07', () => {
    const flowOf = () => document.querySelector<HTMLElement>('#flow')!
    const feeCard = () => screen.getByText('Fee').closest('.rx-stat')!

    it.each([
      ['a quorum commitment', `/tx/${MAINNET.qctx}`, 'qcTx'],
      ['a hard-fork signal', `/tx/${MNHF}?network=testnet`, 'mnhfTx'],
    ])('shows %s with a zero fee and no value ribbon', async (_name, url, kind) => {
      await payload(url, kind)
      await waitFor(() => expect(feeCard()).toHaveTextContent('0 duffs a byte'))
      expect(feeCard()).toHaveTextContent('it spends no coins')
      expect(feeCard()).not.toHaveTextContent('Load all inputs')
      expect(document.body).not.toHaveTextContent('Load all inputs to work it out')
      expect(flowOf()).toHaveTextContent('No value moves in this transaction')
      expect(flowOf().querySelector('svg.rx-flow')).toBeNull()
      expect(flowOf()).not.toHaveTextContent('Credit pool')
    })

    it('keeps the credit-pool ribbon for an asset unlock, where the pool pays out', async () => {
      await payload(`/tx/${MAINNET.assetunlock}`, 'assetUnlockTx')
      await waitFor(() => expect(flowOf().querySelector('svg.rx-flow')).not.toBeNull())
      expect(flowOf()).toHaveTextContent('Credit pool')
      expect(flowOf()).not.toHaveTextContent('No value moves')
    })
  })

  it('says a transaction is not there, and offers the other network @IN-05 @IN-16', async () => {
    renderAt(`/tx/${NO_SUCH}`)
    expect(await screen.findByText('Not found on Mainnet')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Search Testnet/ })).toHaveAttribute(
      'href',
      expect.stringContaining('network=testnet'),
    )
  })

  it('refuses text that is not a transaction id without asking Core @IN-05', async () => {
    renderAt('/tx/not-a-txid')
    expect(await screen.findByText('Not found on Mainnet')).toBeInTheDocument()
  })

  it('opens a deep link to an output and marks it @IN-05', async () => {
    renderAt(`/tx/${MAINNET.transfer}#out-1`)
    await waitFor(() => expect(document.querySelector('#out-1')).not.toBeNull(), { timeout: 4000 })
    expect(document.querySelector('#out-1')).toHaveAttribute('data-anchor', 'on')
  })

  it('links a spent output to the transaction that spent it, at the input that did @IN-05', async () => {
    renderAt(`/tx/${SPENT_SOURCE}`)
    const row = await waitFor(
      () => {
        const el = document.querySelector<HTMLElement>('#out-0')
        expect(el).not.toBeNull()
        return el!
      },
      { timeout: 4000 },
    )
    const link = await within(row).findByRole('link', { name: /in [0-9a-f]{4}…[0-9a-f]{4}/ })
    expect(link.getAttribute('href')).toBe(`/tx/${SPENDER}#in-0`)
    expect(row).toHaveTextContent('Spent')
  })

  it('reads the spend state of a recent transaction from the current address lists, not its cached page @IN-05', async () => {
    renderAt(`/tx/${MAINNET.transfer}`)
    await waitFor(
      () => {
        expect(document.querySelectorAll('#io [data-spend="spent"]')).toHaveLength(8)
        expect(document.querySelectorAll('#io [data-spend="unknown"]')).toHaveLength(0)
      },
      { timeout: 4000 },
    )
    expect(document.querySelector('#out-8 [data-spend]')?.getAttribute('data-spend')).toBe(
      'unspent',
    )
    const first = await within(document.querySelector<HTMLElement>('#out-0')!).findByRole('link', {
      name: /in [0-9a-f]{4}…[0-9a-f]{4}/,
    })
    expect(first.getAttribute('href')).toBe(
      '/tx/653ff05aacefc2c93e664f8cc41b3a71f5ab2a6b6f6315f8108de696182482a4#in-14',
    )
  })

  it('never calls an output unspent that the source cannot vouch for @HY-07', async () => {
    renderAt(`/tx/${MAINNET.coinbase}`)
    await waitFor(
      () => expect(document.querySelector('#out-1 [data-spend="unspendable"]')).not.toBeNull(),
      { timeout: 4000 },
    )
    expect(document.querySelector('#out-1')).toHaveTextContent('Unspendable')
    await waitFor(() => expect(document.querySelector('#out-0 [data-spend]')).not.toBeNull(), {
      timeout: 4000,
    })
    expect(screen.queryByText('Unspent')).toBeNull()
    expect(document.querySelector('#out-0 [data-spend]')?.getAttribute('data-spend')).toBe(
      'unknown',
    )
  })

  it('opens a mined transaction’s settlement at the step it has and says arrival times are not kept @HY-07', async () => {
    renderAt(`/tx/${MAINNET.proreg}`)
    const mined = await waitFor(
      () => {
        const el = document.querySelector<HTMLElement>('[data-step="mined"]')
        expect(el).not.toBeNull()
        return el!
      },
      { timeout: 4000 },
    )
    expect(mined).toHaveTextContent(/2026/)
    expect(document.querySelector('[data-step="seen"]')).toBeNull()
    expect(screen.queryByText(/not recorded/)).toBeNull()
    expect(
      screen.getByText('Mempool arrival times aren’t kept once a transaction is mined.'),
    ).toBeInTheDocument()
  })

  it('says a lock is reported by one node until a second source agrees @IN-05', async () => {
    const original = core.tx.bind(core)
    vi.spyOn(core, 'tx').mockImplementation(async (net, txid, signal) => {
      const found = await original(net, txid, signal)
      return found.data
        ? {
            ...found,
            data: {
              ...found.data,
              isChainLocked: false,
              chainLockClaim: 'one-node' as const,
              isInstantLocked: true,
              instantLockClaim: 'one-node' as const,
            },
          }
        : found
    })
    renderAt(`/tx/${MAINNET.transfer}`)
    expect(await screen.findByText('ChainLock reported by one node')).toBeInTheDocument()
    expect(screen.getByText('InstantSend lock reported by one node')).toBeInTheDocument()
    expect(screen.queryByText('ChainLocked')).toBeNull()
    expect(screen.queryByText('InstantSend locked')).toBeNull()
  })

  it('names testnet amounts in tDASH everywhere on the page @IN-16', async () => {
    renderAt(`/tx/${TESTNET_NORMAL}?network=testnet`)
    const note = await waitFor(
      () => {
        const el = [...document.querySelectorAll('.rx-kpis *')].find((e) =>
          (e.textContent ?? '').includes('to other addresses'),
        )
        expect(el).toBeDefined()
        return el as HTMLElement
      },
      { timeout: 4000 },
    )
    expect(note.textContent).toMatch(/tDASH to other addresses/)
    const kpis = document.querySelector('.rx-kpis')!.textContent ?? ''
    expect(kpis).not.toMatch(/(^|[^t])DASH/)
  })

  it('links a testnet output to its spender from Insight, labelled as Insight @IN-05 @IN-16 @HY-19', async () => {
    renderAt(`/tx/${TESTNET_NORMAL}?network=testnet`)
    const out0 = await waitFor(
      () => {
        const el = document.querySelector<HTMLElement>('#out-0')
        expect(el).not.toBeNull()
        expect(el!.querySelector('[data-spend="spent"]')).not.toBeNull()
        return el!
      },
      { timeout: 4000 },
    )
    const link = await within(out0).findByRole('link', { name: /in [0-9a-f]{4}…[0-9a-f]{4}/ })
    expect(link.getAttribute('href')).toMatch(
      /^\/tx\/0666a44a[0-9a-f]{56}\?network=testnet#in-\d+$/,
    )
    const out1 = document.querySelector<HTMLElement>('#out-1')!
    expect(
      (await within(out1).findByRole('link', { name: /in [0-9a-f]{4}…[0-9a-f]{4}/ })).getAttribute(
        'href',
      ),
    ).toMatch(/^\/tx\/85ff0299[0-9a-f]{56}\?network=testnet#in-\d+$/)
    expect(document.querySelector('#io [data-source="insight"]')).not.toBeNull()
  })

  describe('which index answers the spend state @IN-05 @IN-16', () => {
    const INSIGHT = /insight\.(testnet\.networks\.)?dash\.org/
    const SPENT_OUT_ADDRESS = 'XsPYocbGL8ubicsjgfav5E8ubFPMHSNzUU'
    let urls: string[] = []
    const record = ({ request }: { request: Request }) => void urls.push(request.url)
    const insightTxReads = () => urls.filter((u) => INSIGHT.test(u) && /\/tx\/[0-9a-f]{64}/.test(u))
    const hyphenReads = (what: RegExp) => urls.filter((u) => u.includes('/x/hy/') && what.test(u))

    beforeEach(() => {
      urls = []
      server.events.on('request:start', record)
    })
    afterEach(() => {
      server.events.removeListener('request:start', record)
    })

    it('keeps Hyphen as the source while it is fresh, and never asks Insight when it names the spender', async () => {
      renderAt(`/tx/${SPENT_SOURCE}`)
      const link = await within(
        await waitFor(() => {
          const el = document.querySelector<HTMLElement>('#out-0')
          expect(el).not.toBeNull()
          return el!
        }),
      ).findByRole('link', { name: /in [0-9a-f]{4}…[0-9a-f]{4}/ })
      expect(link.getAttribute('href')).toBe(`/tx/${SPENDER}#in-0`)
      expect(hyphenReads(/\/address\/.+\/txs/).length).toBeGreaterThan(0)
      expect(urls.filter((u) => INSIGHT.test(u))).toEqual([])
      expect(document.querySelector('#io [data-source="insight"]')).toBeNull()
    })

    it('asks Insight once for the spender when Hyphen says spent and its search finds none', async () => {
      server.use(
        http.get(`*/x/hy/mainnet/address/${SPENT_OUT_ADDRESS}/txs`, () =>
          HttpResponse.json({ asOfHeight: 2_570_102, totalCount: 0, value: [] }),
        ),
      )
      renderAt(`/tx/${SPENT_SOURCE}`)
      const out0 = await waitFor(() => {
        const el = document.querySelector<HTMLElement>('#out-0')
        expect(el).not.toBeNull()
        return el!
      })
      const link = await within(out0).findByRole('link', { name: /in [0-9a-f]{4}…[0-9a-f]{4}/ })
      expect(link.getAttribute('href')).toMatch(/^\/tx\/a1782604[0-9a-f]{56}#in-\d+$/)
      expect(insightTxReads()).toHaveLength(1)
      expect(document.querySelector('#io [data-source="insight"]')).not.toBeNull()
      expect(document.querySelector('#io [data-source="hyphen"]')).not.toBeNull()
    })

    it('reads one Insight transaction and no Hyphen spend lookups while Hyphen is stale', async () => {
      renderAt(`/tx/${TESTNET_NORMAL}?network=testnet`)
      await waitFor(() => {
        expect(document.querySelectorAll('#io [data-spend="spent"]').length).toBeGreaterThan(0)
      })
      expect(insightTxReads()).toHaveLength(1)
      expect(hyphenReads(/\/x\/hy\/testnet\/(address|tx)\//)).toEqual([])
    })
  })

  it('has one Core section navigation @IN-03', async () => {
    renderAt(`/tx/${MAINNET.transfer}`)
    await screen.findByRole('heading', { level: 1, name: /Transaction/ })
    const bars = screen
      .getAllByRole('navigation')
      .filter((n) => within(n).queryByRole('link', { name: 'Mempool' }) !== null)
    expect(bars).toHaveLength(1)
  })

  it('shows the table form of the flow on request @HY-07', async () => {
    const user = userEvent.setup()
    renderAt(`/tx/${MAINNET.transfer}`)
    const toggle = await screen.findByRole('button', { name: /Show as a table/ }, { timeout: 4000 })
    await user.click(toggle)
    const flow = document.querySelector<HTMLElement>('#flow')!
    expect(within(flow).getAllByRole('table').length).toBeGreaterThan(0)
  })
})
