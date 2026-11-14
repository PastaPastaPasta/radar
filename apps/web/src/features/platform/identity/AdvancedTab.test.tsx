import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sdk } from '@/data/sdk'
import { renderAt } from './test-utils'

const IDENTITY = 'BjixEUbqeUZK7BRdqtLgjzwFBovx4BRwS2iwhMriiYqp'
const DASHPAY = 'Bwr4WHCPz5rFVAD87RqTs3izo4zpzwsEdKPWUT1NS1C7'

/** The nonce read has no recording for this contract; answer it from a read that has one. */
beforeEach(() => {
  const real = sdk.call.bind(sdk)
  vi.spyOn(sdk, 'call').mockImplementation(async (net, method, args, signal) => {
    if (method !== 'identities.contractNonce') return real(net, method, args, signal)
    const keys = await real(net, 'identities.getKeys', { id: IDENTITY }, signal)
    return { ...keys, data: 7n } as never
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  cleanup()
  localStorage.clear()
})

const rows = () => document.querySelectorAll('#identity-advanced tbody tr:not(.rx-skelrow)')

describe('Identity Advanced tab @NX-16 @NX-17', () => {
  it('lists the keys bound to a contract, including keys bound to one of its document types', async () => {
    renderAt(`/identity/${IDENTITY}?tab=advanced&contract=${DASHPAY}`)
    await waitFor(() => expect(rows()).toHaveLength(2))
    expect(Array.from(rows()).map((r) => r.querySelector('td')?.textContent)).toEqual(['4', '5'])
    expect(rows()[0]?.textContent).toContain('contactRequest')
    expect(screen.queryByText(/No keys of this identity are bound/)).toBeNull()
  })

  it('drops the last result when the next contract ID is not one', async () => {
    const user = userEvent.setup()
    renderAt(`/identity/${IDENTITY}?tab=advanced&contract=${DASHPAY}`)
    await waitFor(() => expect(rows()).toHaveLength(2))
    const field = screen.getByRole('textbox', { name: 'Contract ID' })
    await user.clear(field)
    await user.type(field, 'nope{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent(/isn.t a contract ID/)
    expect(rows()).toHaveLength(0)
    expect(screen.queryByText('Contract nonce')).toBeNull()
  })
})
