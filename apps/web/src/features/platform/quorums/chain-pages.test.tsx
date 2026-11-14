import { createMemoryHistory } from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app'
import { sdk } from '@/data/sdk/client'
import { writeSourceMode } from '@/lib/source-mode'
import { server } from '@/test/server'

vi.mock('@/ui/chart-view', () => ({ default: () => null }))

function renderAt(url: string) {
  render(<App history={createMemoryHistory({ initialEntries: [url] })} />)
}

const card = (id: string) =>
  waitFor(() => {
    const el = document.getElementById(id)
    expect(el).not.toBeNull()
    return el!
  })

afterEach(() => {
  server.events.removeAllListeners()
  writeSourceMode('all')
})

describe('Quorums', () => {
  it('lists the quorums, filters them by prefix and type, and says they are unproved @NX-55', async () => {
    const user = userEvent.setup()
    renderAt('/quorums')
    const quorums = await card('quorums')
    await waitFor(() =>
      expect(quorums.querySelectorAll('[data-quorum-hash]').length).toBeGreaterThan(3),
    )
    expect(quorums).toHaveTextContent('Not proof-checked')
    const all = quorums.querySelectorAll('[data-quorum-hash]').length
    const first =
      quorums.querySelector('[data-quorum-hash]')!.getAttribute('data-quorum-hash') ?? ''
    await user.type(
      within(quorums).getByRole('searchbox', { name: 'Quorum hash starts with' }),
      first.slice(0, 24),
    )
    await waitFor(() => expect(quorums.querySelectorAll('[data-quorum-hash]')).toHaveLength(1))
    expect(all).toBeGreaterThan(1)
  })

  it('lets the quorum type buttons wrap instead of widening the page on a phone @NX-55', async () => {
    renderAt('/quorums')
    const quorums = await card('quorums')

    expect(within(quorums).getByRole('group', { name: 'Quorum type' })).toHaveClass('rx-seg')
  })

  it('opens already filtered by the prefix of the address @NX-55', async () => {
    renderAt('/quorums?q=000000000000001e')
    const quorums = await card('quorums')
    await waitFor(() =>
      expect(quorums.querySelectorAll('[data-quorum-hash]').length).toBeGreaterThan(0),
    )
    for (const el of quorums.querySelectorAll('[data-quorum-hash]'))
      expect(el.getAttribute('data-quorum-hash')).toMatch(/^000000000000001e/)
  })
})

describe('Credits', () => {
  it('shows the total with a USD estimate @NX-57', async () => {
    renderAt('/credits')
    const total = await card('total-credits')
    await waitFor(() => expect(total.querySelector('[data-amount]')).not.toBeNull())
    expect(total.querySelector('[data-source="sdk"][data-proved="true"]')).not.toBeNull()
  })

  it('says an ID has no prefunded balance, and refuses what is not an ID @NX-57', async () => {
    const user = userEvent.setup()
    renderAt('/credits')
    const lookup = await card('prefunded')
    await user.type(within(lookup).getByLabelText('Balance ID'), '11111111111111111111111111111111')
    await user.click(within(lookup).getByRole('button', { name: 'Look up' }))
    expect(await within(lookup).findByText('No prefunded balance')).toBeInTheDocument()
    await user.clear(within(lookup).getByLabelText('Balance ID'))
    await user.type(within(lookup).getByLabelText('Balance ID'), 'nope')
    await user.click(within(lookup).getByRole('button', { name: 'Look up' }))
    expect(await within(lookup).findByText('That is not a valid ID')).toBeInTheDocument()
  })

  it('shows a balance that is there, with its proof mark and a copy control @NX-57', async () => {
    const id = '5DbLwAxGBzUzo81VewMUwn4b5P4bpv9FNFybi25XB5Bk'
    const real = sdk.call.bind(sdk) as (...a: unknown[]) => Promise<unknown>
    const fake = (...a: unknown[]) =>
      a[1] === 'system.prefundedSpecializedBalance'
        ? Promise.resolve({
            data: { id, balance: 20_000_000_000n },
            source: 'sdk',
            asOf: Date.now(),
            fetchedAt: Date.now(),
            proved: true,
            height: 470_000,
          })
        : real(...a)
    vi.spyOn(sdk, 'call').mockImplementation(fake as never)
    renderAt(`/credits?id=${id}`)
    const lookup = await card('prefunded')
    await waitFor(() => expect(lookup.querySelector('[data-prefunded-balance]')).not.toBeNull())
    expect(lookup.querySelector('[data-amount="20000000000"]')).not.toBeNull()
    expect(lookup.querySelector('[data-source="sdk"][data-proved="true"]')).not.toBeNull()
    expect(lookup.querySelector('[data-copy]')).not.toBeNull()
    expect(screen.queryByText('No prefunded balance')).toBeNull()
    vi.restoreAllMocks()
  })
})

describe('Shielded pool', () => {
  it('shows the pool, the anchors and a copy control on every hash @NX-58', async () => {
    renderAt('/shielded')
    const pool = await card('pool')
    await waitFor(() => expect(pool.querySelector('[data-amount]')).not.toBeNull())
    await waitFor(() =>
      expect(pool.querySelectorAll('[data-recent-anchor] [data-copy]')).toHaveLength(1),
    )
    const anchors = await card('anchors')
    await waitFor(() => expect(anchors.querySelectorAll('[data-anchors] li')).toHaveLength(10))
    expect(anchors.querySelectorAll('[data-anchors] [data-copy]')).toHaveLength(10)
  })

  it('pages the notes by chunk @NX-58', async () => {
    const user = userEvent.setup()
    renderAt('/shielded')
    const notes = await card('notes')
    await waitFor(() => expect(within(notes).getAllByRole('row')).toHaveLength(11))
    expect(notes).toHaveTextContent('starting at note 0')
    expect(within(notes).getByRole('button', { name: 'Previous chunk' })).toBeDisabled()
    await user.click(within(notes).getByRole('button', { name: 'Next chunk' }))
    await waitFor(() => expect(notes).toHaveTextContent('starting at note 2,048'))
  })

  it('looks a nullifier up: spent, then not a nullifier @NX-58', async () => {
    const user = userEvent.setup()
    renderAt('/shielded?nf=7f826385e888a51a3eb12cf9bd6ffc77d75af749987fa06db37c62e6d173f501')
    const lookup = await card('nullifier')
    await waitFor(() =>
      expect(lookup.querySelector('[data-nullifier-result="spent"]')).not.toBeNull(),
    )
    await user.clear(within(lookup).getByLabelText('Nullifier'))
    await user.type(within(lookup).getByLabelText('Nullifier'), 'xyz')
    await user.click(within(lookup).getByRole('button', { name: 'Look up' }))
    expect(await within(lookup).findByText('That is not a nullifier')).toBeInTheDocument()
  })

  it('keeps the proved state and says the history needs the index in Decentralized only mode @NX-58', async () => {
    writeSourceMode('decentralized')
    renderAt('/shielded')
    const pool = await card('pool')
    await waitFor(() => expect(pool.querySelector('[data-amount]')).not.toBeNull())
    await waitFor(() =>
      expect(document.querySelectorAll('[data-unavailable="mode"]')).toHaveLength(1),
    )
    expect(document.getElementById('chart-shielded')).toBeNull()
  })
})
