import { createMemoryHistory } from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { App } from '@/app'
import { fixtureBody } from '@/test/fixtures/load'
import { server } from '@/test/server'

vi.mock('@/ui/chart-view', () => ({ default: () => null }))

interface Listed {
  masternodes: { protx: string; type: string }[]
}
interface Active {
  resultSet: { proTxHash: string }[]
}

describe('Evonodes on Platform @PE-22', () => {
  it('fills the totals of a queued evonode from Platform Explorer’s record of it', async () => {
    const [radar, active] = await Promise.all([
      fixtureBody<Listed>('radar', 'mainnet', 'masternodes'),
      fixtureBody<Active>('pe', 'mainnet', 'validators--isActive-true,limit-100'),
    ])
    const inSet = new Set(active.resultSet.map((v) => v.proTxHash.toLowerCase()))
    const queued = radar.masternodes.find((m) => m.type === 'Evo' && !inSet.has(m.protx))!.protx
    server.use(
      http.get(`*/validator/${queued}`, () =>
        HttpResponse.json({
          proTxHash: queued.toUpperCase(),
          isActive: false,
          proposedBlocksAmount: 1585,
          lastProposedBlockHeader: {
            hash: 'A'.repeat(64),
            height: 471483,
            timestamp: '2026-11-14T10:00:00.000Z',
            blockVersion: 14,
            appVersion: 11,
            l1LockedHeight: 2572000,
            validator: queued.toUpperCase(),
            totalGasUsed: 0,
            appHash: 'B'.repeat(64),
            quorumHash: 'C'.repeat(64),
          },
        }),
      ),
    )
    render(
      <App
        history={createMemoryHistory({
          initialEntries: [`/masternodes?type=evo&view=platform&q=${queued}`],
        })}
      />,
    )
    const table = await screen.findByRole('table', { name: 'Evonodes' })
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(2))
    const row = within(table).getAllByRole('row')[1]!
    await waitFor(() => expect(row).toHaveTextContent('1,585'))
    expect(row).toHaveTextContent('471,483')
    expect(row.querySelector('.rx-lastblock time')).toBeNull()
    expect(row.querySelector('[data-entity="platform-block"] button')).toBeNull()
    expect(row.querySelector('.rx-evonode')).not.toBeNull()
    expect(document.querySelector('[class*="overflow-x-auto"]')).toBeNull()
    expect(row).toHaveTextContent('Queued')
  })
})
