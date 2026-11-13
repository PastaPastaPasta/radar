import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { queryLog } from '@/data/query-log'
import { openDiagnostics, panelsState, resetPanels } from '../panels'
import { renderInApp } from '../test-utils'
import { Diagnostics } from './Diagnostics'

beforeEach(() => {
  queryLog.clear()
  resetPanels()
  queryLog.push({
    net: 'mainnet',
    source: 'sdk',
    what: 'identities.fetch',
    ok: true,
    tookMs: 120,
    node: '192.0.2.1:1443',
    proved: true,
  })
  queryLog.push({
    net: 'mainnet',
    source: 'pe',
    what: 'GET /identities',
    ok: false,
    kind: 'http',
    tookMs: 800,
  })
  queryLog.push({
    net: 'mainnet',
    source: 'radar',
    what: 'GET /summary',
    ok: false,
    kind: 'disabled-by-mode',
    tookMs: 0,
    refusedByMode: true,
  })
})
afterEach(() => {
  queryLog.clear()
  resetPanels()
})

const bodyRows = (table: HTMLElement) => within(table).getAllByRole('row').slice(1)

describe('Diagnostics @NX-62', () => {
  it('lists the requests newest first with source, result, time taken, node and proof', async () => {
    await renderInApp(<Diagnostics />)
    act(() => {
      openDiagnostics()
    })
    const table = await screen.findByRole('table', { name: 'Requests this tab made, newest first' })
    const rows = bodyRows(table)
    expect(rows.map((r) => within(r).getByText(/^(GET|identities)/).textContent)).toEqual([
      'GET /summary',
      'GET /identities',
      'identities.fetch',
    ])
    const sdk = rows[2]!
    expect(sdk).toHaveTextContent('sdk')
    expect(sdk).toHaveTextContent('OK')
    expect(sdk).toHaveTextContent('120 ms')
    expect(sdk).toHaveTextContent('192.0.2.1:1443')
    expect(sdk).toHaveTextContent('Yes')
    expect(rows[1]).toHaveTextContent('http')
  })

  it('shows a request Decentralized only mode refused as refused, not as a failure', async () => {
    await renderInApp(<Diagnostics />)
    act(() => {
      openDiagnostics()
    })
    const table = await screen.findByRole('table')
    expect(bodyRows(table)[0]).toHaveTextContent('Refused by mode')
    expect(bodyRows(table)[0]).not.toHaveTextContent('disabled-by-mode')
  })

  it('filters by source and to failures only', async () => {
    const user = userEvent.setup()
    await renderInApp(<Diagnostics />)
    act(() => {
      openDiagnostics()
    })
    await screen.findByRole('table')
    await user.click(screen.getByRole('button', { name: 'sdk' }))
    expect(bodyRows(screen.getByRole('table'))).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'All' }))
    await user.click(screen.getByRole('checkbox', { name: 'Failures only' }))
    expect(bodyRows(screen.getByRole('table'))).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: 'sdk' }))
    expect(await screen.findByText('No requests match')).toBeInTheDocument()
  })

  it('clears the log, and closes with Escape', async () => {
    const user = userEvent.setup()
    await renderInApp(<Diagnostics />)
    act(() => {
      openDiagnostics()
    })
    await screen.findByRole('table')
    await user.click(screen.getByRole('button', { name: 'Clear' }))
    expect(queryLog.snapshot()).toHaveLength(0)
    expect(await screen.findByText('No requests yet')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(panelsState().diagnostics.open).toBe(false)
  })

  it('copies the shown rows as JSON', async () => {
    const user = userEvent.setup()
    let copied = ''
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: (t: string) => ((copied = t), Promise.resolve()) },
    })
    await renderInApp(<Diagnostics />)
    act(() => {
      openDiagnostics()
    })
    await user.click(await screen.findByRole('button', { name: 'Copy as JSON' }))
    expect((JSON.parse(copied) as { what: string }[]).map((e) => e.what)).toEqual([
      'GET /summary',
      'GET /identities',
      'identities.fetch',
    ])
  })
})
