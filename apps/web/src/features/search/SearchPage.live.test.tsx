import { createMemoryHistory } from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { App } from '@/app'
import { SourceError } from '@/data/errors'
import { resolvers } from './resolvers'
import { epochByName } from './resolvers/epoch'
import type { Resolver } from './types'

// Only the lookups a test names run: the page asks for each prefix of what is typed, and the rest have no recordings.
let kept: Resolver[] = []
beforeEach(() => {
  kept = resolvers.splice(0, resolvers.length, epochByName)
})
afterEach(() => {
  resolvers.splice(0, resolvers.length, ...kept)
})
const add = (r: Resolver) => resolvers.push(r)

async function openSearch(url = '/search') {
  const history = createMemoryHistory({ initialEntries: [url] })
  render(<App history={history} />)
  const input = await screen.findByRole('searchbox')
  return { history, input, user: userEvent.setup() }
}

describe('the search page shows results while typing @W2-28 @X-01', () => {
  it('lists matching pages and entities without Enter, and keeps the address in step', async () => {
    const { user, input, history } = await openSearch()
    await user.type(input, 'status')
    await waitFor(() => {
      const page = document.querySelector('[data-kind="page"] a[href="/status"]')
      expect(page).toHaveTextContent('Status')
    })
    await waitFor(() => expect(history.location.search).toContain('status'))
  })

  it('finds the epoch for "epoch 86"', async () => {
    const { user, input } = await openSearch()
    await user.type(input, 'epoch 86')
    const link = await screen.findByRole('link', { name: /Epoch 86/ })
    expect(link).toHaveAttribute('href', expect.stringContaining('/epoch/86'))
  })

  it('names a lookup that timed out, never its internal id or the browser', async () => {
    add({
      id: 'zz-internal-id',
      what: { id: 'Platform Explorer search', message: 'Platform Explorer search' },
      accepts: ['text'],
      cost: 'local',
      resolve: () =>
        Promise.reject(new SourceError({ source: 'local', kind: 'timeout', message: 'Timed out' })),
    })
    const { user, input } = await openSearch()
    await user.type(input, 'zzzqqq')
    const note = await screen.findByText(/Some lookups didn.t answer/)
    expect(note).toHaveTextContent('Platform Explorer search')
    expect(document.body).not.toHaveTextContent('zz-internal-id')
    expect(document.body).not.toHaveTextContent(/Your browser isn.t answering/)
  })
})
