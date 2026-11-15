import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/react-router'
import { render } from '@testing-library/react'
import { App } from '@/app'
import { renderAt } from '../test-utils'
import { sdk } from '@/data/sdk'
import { SourceError } from '@/data/errors'
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

const GRADES = '7DiE1W5YYgUXx7s68YTMGEM9UssZ5TFg7dXdGaDj8cet'
const GRADE_CONTRACT = {
  id: GRADES,
  ownerId: '1'.repeat(32),
  version: 1,
  documentSchemas: {
    grade: { properties: { class: { type: 'string' }, semester: { type: 'integer' } } },
  },
  indices: {
    grade: [
      {
        name: 'byClass',
        unique: false,
        contested: false,
        properties: [{ field: 'class' }],
      },
    ],
  },
}

describe('Query page results and picker', () => {
  it('decodes GROUP BY keys by the schema type, and labels each phone field @NX-70', async () => {
    stubSdkCalls({
      'contracts.fetch': () => GRADE_CONTRACT,
      'documents.count': () => [
        { key: '4353313031', count: 35n },
        { key: '4353323032', count: 23n },
      ],
    })
    const sql = "SELECT COUNT(*) FROM grade WHERE class IN ('CS101','CS202') GROUP BY class"
    const user = userEvent.setup()
    renderAt(`/query?contract=${GRADES}&q=${encodeURIComponent(sql)}`)
    await user.click(await screen.findByRole('button', { name: 'Run' }))
    expect(await screen.findByText('CS101')).toBeInTheDocument()
    expect(screen.getByText('CS202')).toBeInTheDocument()
    expect(screen.queryByText('4353313031')).toBeNull()
    const row = document.querySelector('[data-results] tbody tr')!
    const cells = [...row.querySelectorAll('td')]
    expect(cells.map((c) => c.className.split(' ')[0])).toEqual(['t', 'f'])
    expect(cells[1]!.getAttribute('data-l')).toBe('Documents')
  })

  it('labels every field of a document row on a phone, with none beside the title @NX-70', async () => {
    stubSdkCalls({
      'contracts.fetch': () => CONTRACT,
      'documents.query': () => [DOMAIN],
    })
    const user = userEvent.setup()
    renderAt('/query')
    await user.click(await screen.findByRole('button', { name: 'Run' }))
    const results = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('[data-results] tbody tr')
      expect(el).not.toBeNull()
      return el!
    })
    const classes = [...results.querySelectorAll('td')].map((c) => c.className.split(' ')[0])
    expect(classes[0]).toBe('t')
    expect(classes.slice(1).every((c) => c === 'f')).toBe(true)
    expect(results.querySelectorAll('td[data-l]').length).toBe(classes.length - 1)
  })

  it('titles a refused query as a query problem, not an outage @NX-70', async () => {
    stubSdkCalls({
      'contracts.fetch': () => CONTRACT,
      'documents.query': () => {
        throw new SourceError({
          source: 'sdk',
          kind: 'http',
          message: 'Operation is not implemented or not supported',
        })
      },
    })
    const user = userEvent.setup()
    renderAt('/query')
    await user.click(await screen.findByRole('button', { name: 'Run' }))
    const problem = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('[data-query-problem="run"]')
      expect(el).not.toBeNull()
      return el!
    })
    expect(within(problem).getByText("Platform couldn't run this query")).toBeInTheDocument()
    expect(within(problem).getByText(/not implemented or not supported/)).toBeInTheDocument()
    expect(screen.queryByText(/isn.t answering/)).toBeNull()
  })

  it('still calls a DAPI outage an outage @NX-70', async () => {
    stubSdkCalls({
      'contracts.fetch': () => CONTRACT,
      'documents.query': () => {
        throw new SourceError({ source: 'sdk', kind: 'network', message: 'Failed to fetch' })
      },
    })
    const user = userEvent.setup()
    renderAt('/query')
    await user.click(await screen.findByRole('button', { name: 'Run' }))
    expect(await screen.findByText(/isn.t answering/)).toBeInTheDocument()
    expect(document.querySelector('[data-query-problem="run"]')).toBeNull()
  })

  it('swaps the presets and the editor when the contract changes @NX-70', async () => {
    stubSdkCalls({ 'contracts.fetch': () => CONTRACT })
    const user = userEvent.setup()
    renderAt('/query')
    const editor = await screen.findByRole('textbox', { name: 'SQL query' })
    expect((editor as HTMLTextAreaElement).value).toContain('FROM domain')
    expect(
      within(document.querySelector('[data-presets]')!).getByText('A name by its label'),
    ).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Contract'), 'DashPay')
    await waitFor(() => expect((editor as HTMLTextAreaElement).value).toContain('FROM profile'))
    const presets = document.querySelector<HTMLElement>('[data-presets]')!
    expect(within(presets).queryByText('A name by its label')).toBeNull()
    expect(
      within(presets).getByText(/DashPay profiles|DashPay profiles of one owner/),
    ).toBeInTheDocument()
  })

  it('offers a first look at a contract with no ready-made query @NX-70', async () => {
    stubSdkCalls({ 'contracts.fetch': () => CONTRACT })
    const user = userEvent.setup()
    renderAt('/query')
    const editor = await screen.findByRole('textbox', { name: 'SQL query' })
    await user.selectOptions(screen.getByLabelText('Contract'), 'Withdrawals')
    await waitFor(() => expect(editor).toHaveValue('SELECT * FROM domain\nLIMIT 5'))
    expect(
      within(document.querySelector('[data-presets]')!).getByText('The first domain documents'),
    ).toBeInTheDocument()
  })

  it('offers Feature flags again, and it can be picked with no preset of its own @NX-70', async () => {
    stubSdkCalls({ 'contracts.fetch': () => CONTRACT })
    const user = userEvent.setup()
    renderAt('/query')
    const picker = await screen.findByLabelText('Contract')
    expect(within(picker).getByRole('option', { name: 'Feature flags' })).toBeInTheDocument()
    expect(within(picker).getByRole('option', { name: 'DPNS' })).toBeInTheDocument()
    expect(within(picker).getByRole('option', { name: 'Withdrawals' })).toBeInTheDocument()
    const editor = screen.getByRole('textbox', { name: 'SQL query' })
    await user.selectOptions(picker, 'Feature flags')
    await waitFor(() => expect(editor).toHaveValue('SELECT * FROM domain\nLIMIT 5'))
  })
})
