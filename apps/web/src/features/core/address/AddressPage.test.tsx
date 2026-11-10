import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderAt, saveDevnet } from '../hy-shared/test-utils'

vi.mock('./qr-image', () => ({ qrPng: () => Promise.resolve(new Blob(['png'], { type: 'image/png' })) }))

const ADDRESS = 'XnT33zjrFKjt3ymfyQZs2FPiKNer3WVj14'
const TESTNET_ADDRESS = 'yX6ZaQMNNaMvNEYrpuwYV7BnMJpZaMQpZa'

describe('Address page', () => {
  it('shows the balance, totals and counts from Hyphen @IN-06 @HY-08', async () => {
    renderAt(`/address/${ADDRESS}`)
    expect(await screen.findByRole('heading', { level: 1, name: 'Address' })).toBeInTheDocument()
    const summary = await waitFor(() => {
      const el = document.querySelector('[data-address-summary]')
      expect(el).toHaveTextContent('992,908')
      return el as HTMLElement
    })
    expect(within(summary).getByText('189')).toBeInTheDocument()
    expect(summary).toHaveTextContent('Total received')
    expect(summary).toHaveTextContent('Total sent')
  })

  it('lists the history with direction and net value, and pages by cursor @HY-08', async () => {
    const user = userEvent.setup()
    renderAt(`/address/${ADDRESS}`)
    const table = await screen.findByRole('table', { name: /Transactions of this address/ })
    await waitFor(() => expect(within(table).getAllByRole('row').length).toBeGreaterThan(20))
    expect(within(table).getAllByText('Received').length).toBeGreaterThan(0)
    const before = within(table).getAllByRole('row').length
    await user.click(screen.getByRole('button', { name: 'Show more' }))
    await waitFor(() => expect(within(table).getAllByRole('row').length).toBeGreaterThan(before))
    expect(within(table).getAllByText('Sent').length).toBeGreaterThan(0)
  })

  it('draws a QR code of the address @IN-06', async () => {
    renderAt(`/address/${ADDRESS}`)
    const img = await screen.findByRole('img', { name: new RegExp(`QR code of the address ${ADDRESS}`) })
    expect(img).toHaveAttribute('src', expect.stringMatching(/^blob:/))
  })

  it('says where the data comes from @IN-06', async () => {
    renderAt(`/address/${ADDRESS}`)
    await screen.findByRole('table', { name: /Transactions of this address/ })
    await waitFor(() => expect(document.querySelector('[data-source="hyphen"]')).not.toBeNull())
  })

  it('refuses text that is not an address @IN-06', async () => {
    renderAt('/address/not-an-address')
    expect(await screen.findByText('That isn’t a Dash address.')).toBeInTheDocument()
  })

  it('offers the other network for an address that belongs to it @IN-16', async () => {
    renderAt(`/address/${TESTNET_ADDRESS}`)
    expect(await screen.findByText('This is a testnet address.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open it on testnet' })).toHaveAttribute(
      'href',
      expect.stringContaining('network=testnet'),
    )
  })

  it('works on testnet @IN-16 @HY-19', async () => {
    renderAt(`/address/${TESTNET_ADDRESS}?network=testnet`)
    const summary = await waitFor(() => {
      const el = document.querySelector('[data-address-summary]')
      expect(el).toHaveTextContent('999,999')
      return el as HTMLElement
    })
    expect(summary).toHaveTextContent('tDASH')
  })
})
