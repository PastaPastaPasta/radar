import { createMemoryHistory } from '@tanstack/react-router'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { App } from '@/app'
import { clearSaved, saveItem } from '@/features/entity'

const SAVED_KEY = 'radar.saved'

const ID_A = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec'
const ID_B = '4EfA9Jrvv3nnCFdSf7fad59851iiTRZ6Wcu6YVJ4iSeF'
const ID_C = 'HgRABLHCCFMCSzpbvBUiqbqaVMPqnqBMpoSRm2ZyUJF7'

function renderAt(url: string) {
  const history = createMemoryHistory({ initialEntries: [url] })
  render(<App history={history} />)
  return history
}

beforeEach(() => {
  clearSaved()
  saveItem({ net: 'mainnet', kind: 'identity', id: ID_A, label: 'Alice' }, 3)
  saveItem({ net: 'mainnet', kind: 'contract', id: ID_B }, 2)
  saveItem({ net: 'testnet', kind: 'token', id: ID_C, label: 'Test token' }, 1)
})
afterEach(() => {
  clearSaved()
  localStorage.clear()
})

const rows = () => screen.getAllByRole('row').slice(1)

describe('Saved page @NX-06', () => {
  it('lists this network’s items and says they stay only in this browser', async () => {
    renderAt('/saved')
    await screen.findByRole('heading', { level: 1, name: 'Saved' })
    expect(await screen.findByText(/stay only in this browser/)).toBeInTheDocument()
    expect(await screen.findByText('Alice')).toBeInTheDocument()
    expect(screen.queryByText('Test token')).toBeNull()
    expect(rows()).toHaveLength(2)
  })

  it('shows every network and filters by kind from the address', async () => {
    renderAt('/saved?scope=all&kind=token')
    expect(await screen.findByText('Test token')).toBeInTheDocument()
    expect(screen.queryByText('Alice')).toBeNull()
    expect(rows()).toHaveLength(1)
    expect(within(rows()[0]!).getByText('Testnet')).toBeInTheDocument()
    const link = within(rows()[0]!).getAllByRole('link')[0]!
    expect(link).toHaveAttribute('href', expect.stringContaining('network=testnet'))
  })

  it('switches scope and kind without leaving the page', async () => {
    const user = userEvent.setup()
    const history = renderAt('/saved')
    await screen.findByText('Alice')
    await user.click(screen.getByRole('button', { name: 'All networks' }))
    expect(await screen.findByText('Test token')).toBeInTheDocument()
    expect(history.location.search).toContain('scope=all')

    await user.click(screen.getByRole('button', { name: /Contract/ }))
    expect(await screen.findAllByRole('row')).toHaveLength(2)
    expect(screen.queryByText('Alice')).toBeNull()
    expect(history.location.search).toContain('kind=contract')
  })

  it('removes one item, and clears the items shown only after a confirmation', async () => {
    const user = userEvent.setup()
    renderAt('/saved?scope=all')
    await screen.findByText('Alice')

    await user.click(screen.getByRole('button', { name: 'Remove Alice from saved' }))
    expect(screen.queryByText('Alice')).toBeNull()
    expect(JSON.parse(localStorage.getItem(SAVED_KEY)!) as unknown[]).toHaveLength(2)

    await user.click(screen.getByRole('button', { name: 'Clear shown' }))
    expect(JSON.parse(localStorage.getItem(SAVED_KEY)!) as unknown[]).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: 'Clear shown' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Clear shown' }))
    await user.click(screen.getByRole('button', { name: 'Yes, remove' }))
    expect(JSON.parse(localStorage.getItem(SAVED_KEY)!) as unknown[]).toHaveLength(0)
    expect(await screen.findByText('Nothing saved yet')).toBeInTheDocument()
  })

  it('clears only the network it shows, not the others', async () => {
    const user = userEvent.setup()
    renderAt('/saved')
    await screen.findByText('Alice')
    await user.click(screen.getByRole('button', { name: 'Clear shown' }))
    await user.click(screen.getByRole('button', { name: 'Yes, remove' }))
    const left = JSON.parse(localStorage.getItem(SAVED_KEY)!) as { net: string }[]
    expect(left.map((s) => s.net)).toEqual(['testnet'])
    expect(await screen.findByText('Nothing saved here')).toBeInTheDocument()
  })
})
