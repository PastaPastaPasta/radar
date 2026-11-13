import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/react-router'
import { render } from '@testing-library/react'
import { App } from '@/app'
import { renderAt } from '../test-utils'
import { sdk } from '@/data/sdk'
import { sourced, stubSdkCalls } from '../test-sdk'

const DPNS = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec'
const DOMAIN = {
  id: 'FXyN2NZAdRFADgBQfb1XM1Qq7pWoEcgSWj1GaiQJqcrS',
  ownerId: 'BjixEUbqeUZK7BRdqtLgjzwFBovx4BRwS2iwhMriiYqp',
  contractId: DPNS,
  type: 'domain',
  revision: 1,
  data: { label: 'pshenm1c', normalizedLabel: 'pshenm1c', normalizedParentDomainName: 'dash' },
}
const CONTRACT = {
  id: DPNS,
  ownerId: '1'.repeat(32),
  version: 1,
  documentSchemas: { domain: { properties: { label: { type: 'string' } } } },
  indices: {
    domain: [
      {
        name: 'parentNameAndLabel',
        unique: true,
        contested: false,
        properties: [{ field: 'normalizedParentDomainName' }, { field: 'normalizedLabel' }],
      },
    ],
  },
}

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('Query page', () => {
  it('runs the editor text on the button and with ctrl+enter @NX-70', async () => {
    const calls = stubSdkCalls({
      'contracts.fetch': () => CONTRACT,
      'documents.query': () => [DOMAIN],
    })
    const user = userEvent.setup()
    renderAt('/query')
    expect(await screen.findByRole('heading', { level: 1, name: 'Query' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Run' }))
    const results = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('[data-results]')
      expect(el).not.toBeNull()
      return el!
    })
    expect((await within(results).findAllByText('pshenm1c')).length).toBeGreaterThan(0)
    const queries = () => calls.mock.calls.filter((c) => c[1] === 'documents.query').length
    expect(queries()).toBe(1)
    await user.click(screen.getByRole('textbox', { name: 'SQL query' }))
    await user.keyboard('{Control>}{Enter}{/Control}')
    await waitFor(() => expect(queries()).toBe(2))
  })

  it('stops a statement that is still waiting when Cancel is pressed @NX-70', async () => {
    const waiting = vi.fn()
    vi.spyOn(sdk, 'call').mockImplementation(((
      _net: string,
      method: string,
      _args: unknown,
      signal?: AbortSignal,
    ) => {
      if (method === 'contracts.fetch') return Promise.resolve(sourced(CONTRACT))
      waiting()
      return new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'))
        })
      })
    }) as never)
    const user = userEvent.setup()
    renderAt('/query')
    await user.click(await screen.findByRole('button', { name: 'Run' }))
    await waitFor(() => expect(waiting).toHaveBeenCalled())
    const cancel = screen.getByRole('button', { name: 'Cancel' })
    expect(cancel).toBeEnabled()
    await user.click(cancel)
    expect(await screen.findByText('Cancelled')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Run' })).toBeEnabled()
  })

  it('explains syntax it does not support and sends nothing @NX-70', async () => {
    const calls = stubSdkCalls({ 'contracts.fetch': () => CONTRACT })
    const user = userEvent.setup()
    renderAt('/query')
    const editor = await screen.findByRole('textbox', { name: 'SQL query' })
    await user.clear(editor)
    await user.type(editor, 'SELECT * FROM dpns.domain JOIN x')
    await user.click(screen.getByRole('button', { name: 'Run' }))
    const problem = await screen.findByRole('alert')
    expect(within(problem).getByText('Nothing was sent.')).toBeInTheDocument()
    expect(calls.mock.calls.some((c) => String(c[1]).startsWith('documents.'))).toBe(false)
  })

  it('runs two statements and refuses three @NX-70', async () => {
    const calls = stubSdkCalls({
      'contracts.fetch': () => CONTRACT,
      'documents.query': () => [DOMAIN],
    })
    const user = userEvent.setup()
    renderAt('/query')
    const editor = await screen.findByRole('textbox', { name: 'SQL query' })
    await user.clear(editor)
    await user.click(editor)
    await user.paste('SELECT * FROM dpns.domain LIMIT 1; SELECT * FROM dpns.domain LIMIT 2')
    await user.click(screen.getByRole('button', { name: 'Run' }))
    await waitFor(() =>
      expect(calls.mock.calls.filter((c) => c[1] === 'documents.query')).toHaveLength(2),
    )
    await user.clear(editor)
    await user.click(editor)
    await user.paste(
      'SELECT * FROM dpns.domain; SELECT * FROM dpns.domain; SELECT * FROM dpns.domain',
    )
    await user.click(screen.getByRole('button', { name: 'Run' }))
    expect(await screen.findByText(/Up to 2 statements/)).toBeInTheDocument()
  })

  it('answers a COUNT with its groups @NX-70', async () => {
    stubSdkCalls({
      'contracts.fetch': () => CONTRACT,
      'documents.count': () => [{ key: 'dash', count: 1234n }],
    })
    const user = userEvent.setup()
    renderAt('/query')
    const editor = await screen.findByRole('textbox', { name: 'SQL query' })
    await user.clear(editor)
    await user.click(editor)
    await user.paste('SELECT COUNT(*) FROM dpns.domain')
    await user.click(screen.getByRole('button', { name: 'Run' }))
    expect(await screen.findByText('1,234')).toBeInTheDocument()
  })

  it('keeps saved queries across a reload @NX-70', async () => {
    stubSdkCalls({ 'contracts.fetch': () => CONTRACT })
    const user = userEvent.setup()
    const first = render(<App history={createMemoryHistory({ initialEntries: ['/query'] })} />)
    await user.type(await screen.findByLabelText('Name for this query'), 'mine')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('button', { name: 'mine' })).toBeInTheDocument()
    first.unmount()
    renderAt('/query')
    expect(await screen.findByRole('button', { name: 'mine' })).toBeInTheDocument()
  })

  it('opens a shared link with its text and contract @NX-70', async () => {
    stubSdkCalls({ 'contracts.fetch': () => CONTRACT })
    renderAt(`/query?q=${encodeURIComponent('SELECT * FROM domain LIMIT 3')}&contract=${DPNS}`)
    const editor = await screen.findByRole('textbox', { name: 'SQL query' })
    expect(editor).toHaveValue('SELECT * FROM domain LIMIT 3')
  })
})
