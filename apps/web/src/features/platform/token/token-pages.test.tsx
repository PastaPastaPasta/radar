import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { sdk } from '@/data/sdk'
import { writeSourceMode } from '@/lib/source-mode'
import { renderAt } from '../identity/test-utils'

const TOKEN = 'AxAYWyXV6mrm8Sq7vc7wEM18wtL8a8rgj64SM3SDmzsB'
const HOLDER = '3NQNyo6DAtXxdWjG4pKxyi51yis9k19UgbtYxZSmFrAh'
const OTHER = 'BjixEUbqeUZK7BRdqtLgjzwFBovx4BRwS2iwhMriiYqp'
const TESTNET_PADDR = 'tdash1kpgz9hk6tkn5zj3653s8qkjmk9439qkf0gt229dv'

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
  writeSourceMode('all')
})

const asked = (call: { mock: { calls: unknown[][] } }) =>
  call.mock.calls.map((c) => [c[1], c[2]] as const)

describe('Token page @NX-30', () => {
  it('shows the supply and where the token comes from on the overview @NX-30', async () => {
    renderAt(`/token/${TOKEN}`)
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument()
    await waitFor(() => {
      expect(document.querySelector('[data-token-supply]')).not.toBeNull()
    })
    expect(document.querySelector('#token-summary')).not.toBeNull()
  })

  it('says a malformed ID is not a token ID, and asks nothing @NX-30', async () => {
    const call = vi.spyOn(sdk, 'call')
    renderAt('/token/not-a-token')
    expect(await screen.findByText('That isn’t a token ID.')).toBeInTheDocument()
    expect(asked(call)).toEqual([])
  })

  it('reads the rules from the contract on the definition tab @NX-31', async () => {
    renderAt(`/token/${TOKEN}?tab=definition`)
    await waitFor(() => {
      expect(document.querySelector('#token-rules')).not.toBeNull()
    })
    expect(document.querySelector('#token-names')).not.toBeNull()
    expect(document.querySelector('#token-raw')).not.toBeNull()
  })

  it('says a token without a perpetual distribution has no claims to look up @NX-32', async () => {
    renderAt(`/token/${TOKEN}?tab=distribution`)
    expect(await screen.findByText('This token has no perpetual distribution.')).toBeInTheDocument()
  })

  it('shows one identity’s balance on the balance tab @NX-59', async () => {
    renderAt(`/token/${TOKEN}?tab=balance&who=${HOLDER}`)
    await waitFor(() => {
      expect(document.querySelector('[data-field="token-balance"]')).not.toBeNull()
    })
  })

  it('asks for an identity before showing a balance @NX-59', async () => {
    renderAt(`/token/${TOKEN}?tab=balance`)
    expect(
      await screen.findByText(
        'Enter an identity ID or a DPNS name to see its balance of this token.',
      ),
    ).toBeInTheDocument()
  })

  it('says the activity and holder tabs need Platform Explorer, in Decentralized only mode @PE-24', async () => {
    writeSourceMode('decentralized')
    renderAt(`/token/${TOKEN}?tab=activity`)
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument()
    await waitFor(() => {
      expect(document.querySelectorAll('[data-unavailable="mode"]').length).toBe(1)
    })
  })
})

describe('Token holders page @PE-25', () => {
  it('asks the node once for the chosen identities and lists each balance @PE-25', async () => {
    const real = sdk.call.bind(sdk)
    const call = vi.spyOn(sdk, 'call').mockImplementation((...a) => real(...a))
    renderAt(`/token/${TOKEN}/holders?ids=${[HOLDER, OTHER].sort().join(',')}`)
    await waitFor(() => {
      expect(document.querySelectorAll('[data-balance-state]').length).toBe(2)
    })
    expect(document.querySelectorAll('[data-balance-state="unknown"]')).toHaveLength(0)
    expect(asked(call).filter(([m]) => m === 'tokens.balances')).toHaveLength(1)
  })

  it('shows Unknown, never zero, for identities the node did not answer for @PE-25', async () => {
    const real = sdk.call.bind(sdk)
    vi.spyOn(sdk, 'call').mockImplementation((net, method, args, signal) =>
      method === 'tokens.balances'
        ? Promise.reject(new Error('node unreachable'))
        : real(net, method, args, signal),
    )
    renderAt(`/token/${TOKEN}/holders?ids=${[HOLDER, OTHER].sort().join(',')}`)
    await waitFor(() => {
      expect(document.querySelectorAll('[data-balance-state="unknown"]').length).toBe(2)
    })
    expect(document.querySelectorAll('[data-balance-state="known"]')).toHaveLength(0)
    expect(within(document.body).getAllByText(/Unknown/).length).toBeGreaterThan(0)
  })

  it('adds an identity from the form and puts it in the address @PE-25', async () => {
    const user = userEvent.setup()
    renderAt(`/token/${TOKEN}/holders`)
    const box = await screen.findByLabelText('Identity IDs or names')
    await user.type(box, HOLDER)
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => {
      expect(document.querySelectorAll('[data-balance-state]').length).toBe(1)
    })
  })

  it('names a part that is neither an ID nor a name @PE-25', async () => {
    const user = userEvent.setup()
    renderAt(`/token/${TOKEN}/holders`)
    const box = await screen.findByLabelText('Identity IDs or names')
    await user.type(box, '!!')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect(await screen.findByText(/is neither an identity ID nor a name/)).toBeInTheDocument()
  })
})

describe('Platform address page @PE-26', () => {
  it('shows what Platform holds for the address @PE-26', async () => {
    renderAt(`/platform-address/${TESTNET_PADDR}?network=testnet`)
    await waitFor(() => {
      expect(document.querySelector('#paddr-summary')).not.toBeNull()
    })
  })

  it('explains an address that is not a Platform address, and asks nothing @PE-26', async () => {
    const call = vi.spyOn(sdk, 'call')
    renderAt('/platform-address/XnotAnAddress')
    expect(await screen.findByText('That isn’t a Platform address.')).toBeInTheDocument()
    expect(asked(call)).toEqual([])
  })

  it('sends a testnet address opened on mainnet to the other network @PE-26', async () => {
    const call = vi.spyOn(sdk, 'call')
    renderAt(`/platform-address/${TESTNET_PADDR}`)
    expect(await screen.findByText(/This is a Testnet address/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Open it on/ })).toHaveAttribute(
      'href',
      expect.stringContaining('testnet'),
    )
    expect(asked(call)).toEqual([])
  })

  it('says the transitions need an indexer, in Decentralized only mode @PE-26', async () => {
    writeSourceMode('decentralized')
    renderAt(`/platform-address/${TESTNET_PADDR}?network=testnet`)
    await waitFor(() => {
      expect(document.querySelectorAll('[data-unavailable="mode"]').length).toBe(1)
    })
  })
})
