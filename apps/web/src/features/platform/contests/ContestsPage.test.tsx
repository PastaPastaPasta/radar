import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderAt } from '../identity/test-utils'

afterEach(() => {
  vi.unstubAllGlobals()
  cleanup()
  localStorage.clear()
})

const phone = () =>
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: query.includes('max-width: 767px'),
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList,
  )

describe('Contests page', () => {
  it('describes the default filter, which is every contest @NX-42', async () => {
    renderAt('/contests')
    await screen.findByRole('heading', { level: 1, name: 'Name contests' })
    expect(document.body.textContent).toContain('Every name contest')
    expect(document.body.textContent).not.toContain('Active contested names')
    cleanup()
    renderAt('/contests?status=active')
    await waitFor(() => {
      expect(document.body.textContent).toContain('Name contests still open')
    })
  })

  it('keeps the filters behind one disclosure on a phone, with a count of the active ones @NX-42', async () => {
    phone()
    const user = userEvent.setup()
    renderAt('/contests?contract=GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec&type=domain')
    const details = await waitFor(() => {
      const el = document.querySelector<HTMLDetailsElement>('[data-contest-filters]')
      expect(el).not.toBeNull()
      return el!
    })
    expect(details.open).toBe(false)
    const summary = details.querySelector('summary')!
    expect(summary).toHaveTextContent('Filters')
    expect(summary).toHaveTextContent('2')
    await user.click(summary)
    expect(details.open).toBe(true)
    expect(within(details).getByRole('group', { name: 'Status' })).toBeInTheDocument()
  })

  it('shows the filters open on a wide screen @NX-42', async () => {
    renderAt('/contests')
    const details = await waitFor(() => {
      const el = document.querySelector<HTMLDetailsElement>('[data-contest-filters]')
      expect(el).not.toBeNull()
      return el!
    })
    expect(details.open).toBe(true)
  })
})
