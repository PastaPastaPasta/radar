import { createMemoryHistory } from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { App } from '@/app'

function renderAt(url: string) {
  const history = createMemoryHistory({ initialEntries: [url] })
  render(<App history={history} />)
  return history
}

const DEVNET_STORAGE_KEY = 'radar.devnets'

afterEach(() => {
  localStorage.clear()
})

describe('Settings', () => {
  it('lists the four units and shows the example in the chosen one', async () => {
    const user = userEvent.setup()
    renderAt('/settings')
    const group = await screen.findByRole('group', { name: 'Unit for DASH amounts' })
    expect(
      within(group)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['DASH', 'mDASH', 'µDASH', 'duffs'])
    expect(await screen.findByText(/1\.2346/)).toBeInTheDocument()

    await user.click(within(group).getByRole('button', { name: 'duffs' }))

    expect(localStorage.getItem('radar.unit')).toBe('duffs')
    expect(await screen.findByText(/123,456,789/)).toBeInTheDocument()
    expect(within(group).getByRole('button', { name: 'duffs' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('remembers the unit and the USD choice after a reload', async () => {
    localStorage.setItem('radar.unit', 'mDASH')
    localStorage.setItem('radar.fiat', '0')
    renderAt('/settings')
    const group = await screen.findByRole('group', { name: 'Unit for DASH amounts' })
    expect(within(group).getByRole('button', { name: 'mDASH' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('checkbox', { name: /USD value/ })).not.toBeChecked()
  })

  it('shows the USD figure on mainnet from the rate and hides it on testnet', async () => {
    const user = userEvent.setup()
    renderAt('/settings')
    expect(await screen.findByText(/≈ \$/)).toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: /USD value/ }))
    expect(localStorage.getItem('radar.fiat')).toBe('0')
    await waitFor(() => expect(screen.queryByText(/≈ \$/)).toBeNull())
  })

  it('never shows USD on testnet', async () => {
    renderAt('/settings?network=testnet')
    await screen.findByRole('heading', { level: 1, name: 'Settings' })
    expect(screen.getByText(/Test coins have no value/)).toBeInTheDocument()
    expect(screen.queryByText(/≈ \$/)).toBeNull()
  })

  it('keeps the UTC switch', async () => {
    const user = userEvent.setup()
    renderAt('/settings')
    await user.click(await screen.findByRole('checkbox', { name: 'Show times in UTC' }))
    expect(localStorage.getItem('radar.utc')).toBe('1')
    await user.click(screen.getByRole('checkbox', { name: 'Show times in UTC' }))
    expect(localStorage.getItem('radar.utc')).toBeNull()
  })

  it('offers the ten languages, each in its own script @IN-13 @HY-15', async () => {
    renderAt('/settings')
    const select = await screen.findByRole('combobox', { name: 'Language' })
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual([
      'English',
      'Deutsch',
      'Français',
      'Español',
      'Português',
      '日本語',
      '简体中文',
      'Русский',
      'Türkçe',
      'Українська',
    ])
  })

  it('adds, edits and removes a devnet', async () => {
    const user = userEvent.setup()
    renderAt('/settings')
    await screen.findByText('No devnets saved.')

    await user.type(screen.getByLabelText('Devnet name'), 'ruby')
    await user.type(screen.getByLabelText('DAPI addresses'), '192.0.2.10:1443')
    await user.click(screen.getByRole('button', { name: 'Add devnet' }))

    const list = await screen.findByRole('list', { name: 'Saved devnets' })
    expect(within(list).getByText('ruby')).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem(DEVNET_STORAGE_KEY)!)).toEqual([
      { name: 'ruby', dapiAddresses: ['192.0.2.10:1443'] },
    ])

    await user.click(within(list).getByRole('button', { name: 'Edit' }))
    const addresses = within(list).getByLabelText('DAPI addresses')
    await user.clear(addresses)
    await user.type(addresses, '192.0.2.20:1443')
    await user.click(within(list).getByRole('button', { name: 'Save changes' }))
    expect(
      (JSON.parse(localStorage.getItem(DEVNET_STORAGE_KEY)!) as { dapiAddresses: string[] }[])[0]
        ?.dapiAddresses,
    ).toEqual(['192.0.2.20:1443'])

    await user.click(within(list).getByRole('button', { name: 'Remove ruby' }))
    await screen.findByText('No devnets saved.')
  })

  it('refuses a devnet with no usable address', async () => {
    const user = userEvent.setup()
    renderAt('/settings')
    await user.type(await screen.findByLabelText('Devnet name'), 'ruby')
    await user.type(screen.getByLabelText('DAPI addresses'), 'nonsense')
    await user.click(screen.getByRole('button', { name: 'Add devnet' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/host:port/)
    expect(localStorage.getItem(DEVNET_STORAGE_KEY)).toBeNull()
  })
})
