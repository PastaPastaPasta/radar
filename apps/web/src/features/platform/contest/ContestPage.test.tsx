import { cleanup, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { sdk } from '@/data/sdk'
import { renderAt } from '../identity/test-utils'

afterEach(() => {
  vi.restoreAllMocks()
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
    expect(rows.map((r) => r.getAttribute('data-choice'))).toEqual([
      'CUaJuBYgwXBCLarN2Gfnnve7SvaM8zvqiQ5PEUztHh4H',
      'abstain',
      'lock',
    ])
    expect(rows[0]?.textContent).toContain('20')
    expect(rows[0]?.textContent).toContain('100.0%')
    const contender = document.querySelector<HTMLElement>('[data-contender]')
    expect(within(contender!).getByRole('link')).toHaveAttribute(
      'href',
      expect.stringContaining('CUaJu'),
    )
  })

  it('names a contender once, by the same resolver as every other page, never by Platform Explorer’s alias @NX-15 @NX-40 @PE-20', async () => {
    const real = sdk.call.bind(sdk)
    vi.spyOn(sdk, 'call').mockImplementation(async (net, method, args, signal) => {
      const answer = await real(net, method, args, signal)
      const a = args as { type?: string }
      if (method !== 'documents.query' || a.type !== 'domain') return answer
      return {
        ...answer,
        data: (answer.data as { data: Record<string, unknown> }[]).map((d) => ({
          ...d,
          data: { ...d.data, label: 'spawn', normalizedLabel: 'spawn' },
        })),
      } as typeof answer
    })
    renderAt('/contest/reza')
    await waitFor(() => {
      const contender = document.querySelector<HTMLElement>('[data-contender]')
      expect(contender?.textContent).toContain('spawn.dash')
    })
    expect(document.body.textContent).not.toContain('vampyren')
    cleanup()
    renderAt('/contest/reza?tab=votes')
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /spawn\.dash/ }).length).toBeGreaterThan(0)
    })
    expect(document.body.textContent).not.toContain('vampyren')
  })
})
