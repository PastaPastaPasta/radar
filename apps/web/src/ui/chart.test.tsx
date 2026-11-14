import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Chart } from './chart'

describe('Chart table', () => {
  it('opens as a focusable, named scroll region so a keyboard can reach a wide table', async () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = vi.fn()
        unobserve = vi.fn()
        disconnect = vi.fn()
      },
    )
    const user = userEvent.setup()
    render(
      <Chart
        option={{}}
        height={120}
        label="Blocks per day"
        table={{ columns: ['Day', 'Blocks'], rows: [['Mon', 576]] }}
      />,
    )
    expect(screen.queryByRole('region', { name: 'Blocks per day' })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Show as a table' }))

    const region = await screen.findByRole('region', { name: 'Blocks per day' })
    expect(region).toHaveAttribute('tabindex', '0')
    expect(region.querySelector('table')).not.toBeNull()
  })
})
