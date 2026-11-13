import { cleanup, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { renderAt } from '../identity/test-utils'

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('Contest page', () => {
  it('shows the tally bar, its table and the contenders @NX-43', async () => {
    renderAt('/contest/reza')
    await screen.findByRole('heading', { level: 1 })
    await waitFor(() => {
      expect(document.querySelectorAll('[data-contender]').length).toBeGreaterThan(0)
    })
    const table = document.querySelector<HTMLElement>('[data-tally-table]')
    expect(table).not.toBeNull()
    const rows = [...(table?.querySelectorAll('[data-choice]') ?? [])]
    expect(rows.map((r) => r.getAttribute('data-choice'))).toEqual(['CUaJuBYgwXBCLarN2Gfnnve7SvaM8zvqiQ5PEUztHh4H', 'abstain', 'lock'])
    expect(rows[0]?.textContent).toContain('20')
    expect(rows[0]?.textContent).toContain('100.0%')
    const contender = document.querySelector<HTMLElement>('[data-contender]')
    expect(within(contender as HTMLElement).getByText('vampyren.dash')).toBeTruthy()
  })
})
