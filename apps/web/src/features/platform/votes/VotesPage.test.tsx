import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { server } from '@/test/server'
import { writeSourceMode } from '@/lib/source-mode'
import { renderAt } from '../identity/test-utils'

afterEach(() => {
  server.events.removeAllListeners()
  cleanup()
  localStorage.clear()
  writeSourceMode('all')
})

describe('Votes page', () => {
  it('lists masternode votes with their choice @PE-21', async () => {
    renderAt('/votes')
    await waitFor(() => {
      expect(document.querySelectorAll('tbody tr').length).toBeGreaterThan(5)
    })
  })

  it('says it needs Platform Explorer in Decentralized only mode @PE-21', async () => {
    renderAt('/votes?sources=decentralized')
    await waitFor(() => {
      expect(
        document.querySelector('[data-unavailable]') ?? document.querySelector('[role="status"]'),
      ).not.toBeNull()
    })
    expect(document.querySelectorAll('tbody tr').length).toBe(0)
  })

  it('answers a ProTx hash in the voter filter with what it takes, never with an outage @PE-21', async () => {
    const asked: string[] = []
    server.events.on('request:start', ({ request }) => {
      if (new URL(request.url).searchParams.has('voter_identity')) asked.push(request.url)
    })
    const user = userEvent.setup()
    renderAt('/votes')
    await waitFor(() => {
      expect(document.querySelectorAll('tbody tr').length).toBeGreaterThan(5)
    })
    await user.type(
      screen.getByRole('searchbox', { name: 'Voter identity' }),
      'EE22F5BCE3B6F8734A664BA7BE36B1BAB218EDA764136691E8B506003A7BB662{Enter}',
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(/masternode ProTx hash/)
    expect(screen.queryByText(/isn.t answering/)).toBeNull()
    expect(asked).toEqual([])
    expect(document.querySelectorAll('tbody tr').length).toBeGreaterThan(5)
  })

  it('shows each vote’s voting identity beside its ProTx, which is what the filter takes @PE-21', async () => {
    renderAt('/votes')
    await waitFor(() => {
      expect(document.querySelectorAll('tbody tr').length).toBeGreaterThan(5)
    })
    expect(screen.getAllByRole('columnheader', { name: 'Voting identity' })).toHaveLength(1)
  })
})
