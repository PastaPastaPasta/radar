import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { sdk } from '@/data/sdk'
import { renderAt } from './test-utils'

const M = 'BjixEUbqeUZK7BRdqtLgjzwFBovx4BRwS2iwhMriiYqp'
const PKH = '6da227047f83e9fd7c38792f4422fea3bcd2b824'
const TESTNET_PKH = '7dc0c939f8dcc2775a4069776774c1b623eb1498'

afterEach(() => vi.restoreAllMocks())

const asked = (call: { mock: { calls: unknown[][] } }) => call.mock.calls.map((c) => c[1])

describe('Identity lookup by key hash @NX-17', () => {
  it('explains an empty, short and non-hex hash before asking Platform @NX-17', async () => {
    const call = vi.spyOn(sdk, 'call')
    const user = userEvent.setup()
    renderAt('/identity/lookup')
    const box = await screen.findByLabelText('Public key hash')
    const find = screen.getByRole('button', { name: 'Find' })
    await user.click(find)
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a public key hash')
    await user.type(box, 'abc')
    await user.click(find)
    expect(screen.getByRole('alert')).toHaveTextContent('exactly 40 hexadecimal characters')
    await user.clear(box)
    await user.type(box, 'g'.repeat(40))
    await user.click(find)
    expect(screen.getByRole('alert')).toHaveTextContent('only the characters 0–9 and a–f')
    expect(asked(call)).toEqual([])
  })

  it('opens the empty form, and asks nothing, for a malformed hash in the link @NX-17', async () => {
    const call = vi.spyOn(sdk, 'call')
    renderAt('/identity/lookup?pkh=12')
    expect(await screen.findByLabelText('Public key hash')).toHaveValue('')
    expect(document.querySelector('[data-matches]')).toBeNull()
    expect(asked(call)).toEqual([])
  })

  it('opens the one identity that holds the hash @NX-17', async () => {
    renderAt(`/identity/lookup?pkh=${PKH}`)
    await waitFor(() => {
      expect(document.querySelector('[data-page="/identity/$id"]')).not.toBeNull()
    })
    expect(await screen.findByRole('link', { name: /Manage in Bridge/ })).toHaveAttribute(
      'href',
      expect.stringContaining(M),
    )
  })

  it('lists shared hashes, loads the next page after the last identity, and keeps the first page @NX-17', async () => {
    const real = sdk.call.bind(sdk)
    const pages: Record<string, unknown>[] = []
    vi.spyOn(sdk, 'call').mockImplementation(async (net, method, args, signal) => {
      if (method === 'identities.byNonUniquePublicKeyHash')
        pages.push(args as Record<string, unknown>)
      return real(net, method, args, signal)
    })
    const user = userEvent.setup()
    renderAt(`/identity/lookup?network=testnet&pkh=${TESTNET_PKH}`)
    const more = await screen.findByRole('button', { name: 'Load more' })
    const before = document.querySelectorAll('[data-matches] li').length
    expect(before).toBeGreaterThan(0)
    await user.click(more)
    await waitFor(() => {
      expect(document.querySelectorAll('[data-matches] li').length).toBe(before + 1)
    })
    await user.click(await screen.findByRole('button', { name: 'Load more' }))
    expect(await screen.findByText('That is every match.')).toBeInTheDocument()
    expect(document.querySelectorAll('[data-matches] li').length).toBe(before + 1)
    expect(pages[0]).toEqual({ pkh: TESTNET_PKH })
    expect(pages).toHaveLength(3)
    expect(pages.slice(1).map((p) => p.pkh)).toEqual([TESTNET_PKH, TESTNET_PKH])
    expect(pages.slice(1).every((p) => typeof p.startAfter === 'string')).toBe(true)
  })

  it('says no identity holds a hash nobody uses @NX-17', async () => {
    renderAt(`/identity/lookup?pkh=${'1'.repeat(40)}`)
    expect(await screen.findByText('No identity holds this key hash.')).toBeInTheDocument()
  })
})
