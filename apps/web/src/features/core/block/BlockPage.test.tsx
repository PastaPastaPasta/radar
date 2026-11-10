import { configure, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type * as ClientModule from '@/data/core/client'
import { renderAt } from '../hy-shared/test-utils'

configure({ asyncUtilTimeout: 5000 })

vi.mock('@/data/core/client', async (original) => {
  const actual = await original<typeof ClientModule>()
  const { fixtureCore } = await import('@/test/core-client')
  return { ...actual, core: fixtureCore().core }
})

const TIP = 2570085
const BY_HASH = '0000000000000027cf3cde6fa7d6361587cd5ac4f211ceb6b7bfaf1ba4e01ce4'

describe('Block page', () => {
  it('shows the tip block with its header, coinbase payload and transactions @IN-03 @HY-05', async () => {
    renderAt(`/block/${TIP}`)
    expect(await screen.findByRole('heading', { level: 1, name: /2,570,085/ })).toBeInTheDocument()
    const payload = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('[data-payload="cbTx"]')
      expect(el).not.toBeNull()
      return el!
    })
    expect(payload).toHaveTextContent('Masternode list root')
    expect(
      screen.getByRole('table', { name: /Transactions in block 2,570,085/ }),
    ).toBeInTheDocument()
    expect(document.querySelector('[data-source="dapi"]')).not.toBeNull()
  })

  it('names the reward, the pool slot and the confirmations @IN-03', async () => {
    renderAt(`/block/${TIP}`)
    expect(await screen.findByText('Block reward')).toBeInTheDocument()
    expect(screen.getByText('Mined by')).toBeInTheDocument()
    expect(await screen.findByText(/1 confirmation/)).toBeInTheDocument()
  })

  it('opens a block by hash and links to its neighbours @IN-03', async () => {
    renderAt(`/block/${BY_HASH}`)
    expect(await screen.findByRole('heading', { level: 1, name: /2,570,084/ })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'Next block' })).toHaveAttribute(
      'href',
      '/block/2570085',
    )
    expect(screen.getByRole('link', { name: 'Previous block' })).toHaveAttribute(
      'href',
      expect.stringMatching(/^\/block\/[0-9a-f]{64}/),
    )
  })

  it('has no next block at the tip @IN-03', async () => {
    renderAt(`/block/${TIP}`)
    await screen.findByText(/1 confirmation/)
    expect(screen.queryByRole('link', { name: 'Next block' })).toBeNull()
  })

  it('lists a block with a quorum commitment @HY-05', async () => {
    renderAt('/block/2570002')
    const table = await screen.findByRole('table', { name: /Transactions in block 2,570,002/ })
    await waitFor(() => expect(within(table).getAllByRole('row').length).toBeGreaterThan(1))
    expect((await screen.findAllByText(/quorum commitment/i)).length).toBeGreaterThan(0)
  })

  it('opens an early block from before masternodes @IN-03', async () => {
    renderAt('/block/100000')
    expect(await screen.findByRole('heading', { level: 1, name: /100,000/ })).toBeInTheDocument()
    expect(document.querySelector('[data-payload="cbTx"]')).toBeNull()
  })

  it('says a block past the tip is not there @IN-03', async () => {
    renderAt('/block/2670085')
    expect(await screen.findByText('Not found on Mainnet')).toBeInTheDocument()
  })

  it('does not look up text that is neither a height nor a hash @IN-03', async () => {
    renderAt('/block/hello')
    expect(await screen.findByText('Not found on Mainnet')).toBeInTheDocument()
  })

  it('works on testnet @IN-16 @HY-19', async () => {
    renderAt('/block/1589232?network=testnet')
    expect(await screen.findByRole('heading', { level: 1, name: /1,589,232/ })).toBeInTheDocument()
    expect((await screen.findAllByText(/quorum commitment/i)).length).toBeGreaterThan(0)
  })
})
