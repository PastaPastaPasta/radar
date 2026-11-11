import { configure, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type * as ClientModule from '@/data/core/client'
import { core } from '@/data/core/client'
import { renderAt } from '../hy-shared/test-utils'

configure({ asyncUtilTimeout: 5000 })

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

  it('shows the table form of the flow on request @HY-07', async () => {
    const user = userEvent.setup()
    renderAt(`/tx/${MAINNET.transfer}`)
    const toggle = await screen.findByRole('button', { name: /Show as a table/ }, { timeout: 4000 })
    await user.click(toggle)
    const flow = document.querySelector<HTMLElement>('#flow')!
    expect(within(flow).getAllByRole('table').length).toBeGreaterThan(0)
  })
})
