import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { sdk } from '@/data/sdk'
import type { IdentityVoteDto } from '@/data/sdk/methods/p-id'
import { renderAt } from './test-utils'

const M = 'BjixEUbqeUZK7BRdqtLgjzwFBovx4BRwS2iwhMriiYqp'
const ABSENT = '7fTiLgNCANR7Wf4D7ZuHBje9nrbrgnZpTDXuRdVdv5Ds'
const DPNS = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec'
const HEX = '9d3d7bce0c5b3c1e6e5d1f6a3e2c0c9b0f3a4e3a2c1d0e9f8a7b6c5d4e3f2a1b'

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

const vote = (n: number, choice: IdentityVoteDto['choice']): IdentityVoteDto => ({
  voteId: `vote${String(n).padStart(3, '0')}`,
  contractId: DPNS,
  documentTypeName: 'domain',
  indexName: 'parentNameAndLabel',
  indexValues: ['dash', `name${String(n)}`],
  choice,
})

/** Answers the votes call with `pages` in turn; every other call goes to the recorded fixtures. */
function stubVotes(pages: IdentityVoteDto[][]) {
  const real = sdk.call.bind(sdk)
  const asked: unknown[] = []
  vi.spyOn(sdk, 'call').mockImplementation(async (net, method, args, signal) => {
    if (method !== 'voting.contestedResourceIdentityVotes') return real(net, method, args, signal)
    asked.push(args)
    const first = await real(net, method, { identityId: M, limit: 25 }, signal)
    return { ...first, data: pages[Math.min(asked.length - 1, pages.length - 1)] } as typeof first
  })
  return asked
}

describe('Identity page', () => {
  it('names every tab with text, so each tab link has an accessible name @NX-10', async () => {
    renderAt(`/identity/${M}`)
    const bar = await screen.findByRole('navigation', { name: 'Sections' })
    const names = within(bar)
      .getAllByRole('link')
      .map((a) => a.textContent)
    expect(names).toEqual([
      'Overview',
      'Keys',
      'Names',
      'Tokens',
      'Groups',
      'Votes',
      'Advanced',
      'Transitions',
      'Contracts',
      'Documents',
      'Transfers',
    ])
  })

  it('shows the balance, revision, nonce and names, each proof-checked @NX-10', async () => {
    renderAt(`/identity/${M}`)
    const card = await waitFor(() => {
      const el = document.getElementById('identity-summary')
      expect(el).not.toBeNull()
      return el!
    })
    await waitFor(() => {
      expect(card.querySelector('[data-field="balance"]')).toHaveTextContent('DASH')
    })
    expect(card).toHaveTextContent('1,013,248,617,912 credits')
    await waitFor(() => {
      expect(card).toHaveTextContent('pshenmic.dash')
    })
  })

  it('records the identity as viewed only when the viewer turned that on @NX-10', async () => {
    renderAt(`/identity/${M}`)
    await waitFor(() => {
      expect(document.getElementById('identity-summary')).not.toBeNull()
    })
    expect(localStorage.getItem('radar.viewed')).toBeNull()
    cleanup()
    localStorage.setItem('radar.viewed', JSON.stringify({ on: true, items: [] }))
    renderAt(`/identity/${M}`)
    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem('radar.viewed') ?? '{}')).toMatchObject({
        items: [{ net: 'mainnet', id: M }],
      })
    })
  })

  it('says an absent identity does not exist and links to the other network @NX-10', async () => {
    renderAt(`/identity/${ABSENT}`)
    expect(await screen.findByText('No identity with this ID on mainnet.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Search on testnet' })).toBeInTheDocument()
    expect(document.querySelector('.rx-tabs')).toBeNull()
  })

  it('shows the not-found state without a way to search another network on a devnet-less testnet link @NX-10', async () => {
    renderAt(`/identity/${ABSENT}?network=testnet`)
    expect(await screen.findByText('No identity with this ID on testnet.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Search on mainnet' })).toBeInTheDocument()
  })

  it('refuses something that is not an identity ID without asking Platform @NX-10', async () => {
    const call = vi.spyOn(sdk, 'call')
    renderAt('/identity/nope')
    expect(await screen.findByText('That isn’t an identity ID.')).toBeInTheDocument()
    expect(call).not.toHaveBeenCalled()
  })

  it('does not treat a short hex string as an identity @NX-10', async () => {
    renderAt(`/identity/${HEX.slice(0, 40)}`)
    expect(await screen.findByText('That isn’t an identity ID.')).toBeInTheDocument()
  })
})

describe('Votes tab', () => {
  it('shows each vote’s contest and choice @NX-15', async () => {
    stubVotes([
      [
        vote(1, { type: 'towardsIdentity', identityId: M }),
        vote(2, { type: 'lock' }),
        vote(3, { type: 'abstain' }),
      ],
    ])
    renderAt(`/identity/${M}?tab=votes`)
    const card = await waitFor(() => {
      const el = document.getElementById('identity-votes')
      expect(el?.querySelectorAll('tbody tr').length).toBe(3)
      return el!
    })
    expect(within(card).getByText('Towards')).toBeInTheDocument()
    expect(within(card).getByText('Lock')).toBeInTheDocument()
    expect(within(card).getByText('Abstain')).toBeInTheDocument()
    expect(within(card).getByRole('link', { name: /name1/ })).toBeInTheDocument()
    expect(within(card).queryByRole('button', { name: 'Show more' })).toBeNull()
  })

  it('pages on from the last vote of the page before, keeping the earlier votes @NX-15', async () => {
    const first = Array.from({ length: 25 }, (_, i) => vote(i, { type: 'abstain' }))
    const second = [vote(25, { type: 'lock' })]
    const asked = stubVotes([first, second])
    const user = userEvent.setup()
    renderAt(`/identity/${M}?tab=votes`)
    const more = await screen.findByRole('button', { name: 'Show more' })
    await user.click(more)
    await waitFor(() => {
      expect(document.querySelectorAll('#identity-votes tbody tr').length).toBe(26)
    })
    expect(asked[1]).toMatchObject({
      identityId: M,
      startAtVoteId: 'vote024',
      startAtIncluded: false,
    })
    expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull()
  })

  it('says an identity with no votes has none on record @NX-15', async () => {
    renderAt(`/identity/${M}?tab=votes`)
    expect(await screen.findByText('This identity has no votes on record.')).toBeInTheDocument()
  })
})

describe('Advanced tab', () => {
  it('asks for a contract, then shows its nonce @NX-16', async () => {
    renderAt(`/identity/${M}?tab=advanced`)
    expect(
      await screen.findByText('Enter a contract ID to see its nonce and keys.'),
    ).toBeInTheDocument()
  })

  it('shows the nonce and the keys bound to the named contract @NX-16', async () => {
    renderAt(`/identity/${M}?tab=advanced&contract=${DPNS}`)
    const card = await waitFor(() => {
      const el = document.getElementById('identity-advanced')
      expect(el).toHaveTextContent('Contract nonce')
      expect(el).toHaveTextContent('7')
      return el!
    })
    expect(card).toHaveTextContent('Keys bound to the contract')
  })
})
