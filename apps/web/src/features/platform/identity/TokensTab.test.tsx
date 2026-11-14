import { cleanup, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { sdk } from '@/data/sdk'
import { renderAt } from './test-utils'

const IDENTITY = 'BjixEUbqeUZK7BRdqtLgjzwFBovx4BRwS2iwhMriiYqp'
const SANS = 'AxAYWyXV6mrm8Sq7vc7wEM18wtL8a8rgj64SM3SDmzsB'
const ADDED = '9YxdbQUjJmQsmVPen95HjAU3Esj7tVkWSY2EQWT84ZQP'
const ABSENT = '7fTiLgNCANR7Wf4D7ZuHBje9nrbrgnZpTDXuRdVdv5Ds'

afterEach(() => {
  vi.restoreAllMocks()
  cleanup()
  localStorage.clear()
})

const row = (id: string) =>
  Array.from(document.querySelectorAll('#identity-tokens tbody tr')).find((r) =>
    r.querySelector(`a[href*="${id}"]`),
  )

describe('Identity tokens tab @NX-13', () => {
  it('reads an added token’s name and decimals from its contract, not as raw units', async () => {
    const real = sdk.call.bind(sdk)
    vi.spyOn(sdk, 'call').mockImplementation((net, method, args, signal) =>
      method === 'tokens.contractInfo' && (args as { tokenId?: string }).tokenId === ADDED
        ? real(net, method, { tokenId: SANS } as never, signal)
        : real(net, method, args, signal),
    )
    renderAt(`/identity/${IDENTITY}?tab=tokens&tokens=${ADDED}`)
    await waitFor(() => {
      const text = row(ADDED)?.textContent ?? ''
      expect(text).toMatch(/SANS/)
      expect(text).not.toMatch(/units|Loading/)
    })
  })

  it('says a token that is not on this network is not, instead of a zero balance that is not frozen', async () => {
    const real = sdk.call.bind(sdk)
    vi.spyOn(sdk, 'call').mockImplementation((net, method, args, signal) => {
      const a = args as { tokenIds?: string[] }
      return method.startsWith('tokens.identity') && a.tokenIds?.includes(ABSENT)
        ? real(
            net,
            method,
            { ...a, tokenIds: a.tokenIds.map((id) => (id === ABSENT ? ADDED : id)) } as never,
            signal,
          )
        : real(net, method, args, signal)
    })
    renderAt(`/identity/${IDENTITY}?tab=tokens&tokens=${ABSENT}`)
    await waitFor(() => {
      expect(row(ABSENT)?.textContent).toContain('Not on this network')
    })
    const text = row(ABSENT)?.textContent ?? ''
    expect(text).not.toMatch(/units|Not frozen/)
  })
})
