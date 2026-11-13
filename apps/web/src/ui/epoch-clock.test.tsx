import { I18nProvider } from '@lingui/react'
import { render as plainRender, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { EpochClock } from './epoch-clock'
import { NOW } from './test-utils'

const H = 3_600_000

const withI18n = (node: ReactElement) => <I18nProvider i18n={i18n}>{node}</I18nProvider>
const render = (node: ReactElement) => {
  const view = plainRender(withI18n(node))
  return { ...view, rerender: (next: ReactElement) => view.rerender(withI18n(next)) }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})
afterEach(() => {
  vi.useRealTimers()
})

describe('EpochClock', () => {
  it('fills the track by the share of the epoch gone and says so in words', () => {
    render(
      <EpochClock
        index={88}
        startedAt={NOW - 30 * H}
        expectedEndAt={NOW + 90 * H}
        blocksSoFar={1091}
        estimated
      />,
    )
    const track = screen.getByRole('meter', { name: 'Epoch 88 progress' })
    expect(track).toHaveAttribute('aria-valuenow', '25')
    expect(track).toHaveAttribute('aria-valuemin', '0')
    expect(track).toHaveAttribute('aria-valuemax', '100')
    expect(track.querySelector('i')).toHaveStyle({ width: '25.00%' })
    const text = track.getAttribute('aria-valuetext') ?? ''
    expect(text).toContain('Epoch 88')
    expect(text).toContain('25% through')
    expect(text).toContain('1,091 blocks so far')
    expect(text).toContain('Ends in about 3 d 18 h')
    expect(text).toContain('The end time is an estimate.')
    expect(screen.getByText(/25% through/)).toBeInTheDocument()
    expect(screen.getByText(/Ends in about/)).toHaveTextContent('Ends in about 3 d 18 h')
    expect(screen.getByText('Estimate')).toBeInTheDocument()
  })

  it('drops "about" and the estimate mark when the end is fixed', () => {
    const { container } = render(
      <EpochClock
        index={87}
        startedAt={NOW - 24 * H}
        expectedEndAt={NOW + 24 * H}
        estimated={false}
      />,
    )
    expect(screen.getByText(/^Ends in/)).toHaveTextContent('Ends in 1 d')
    expect(screen.queryByText(/about/)).not.toBeInTheDocument()
    expect(screen.queryByText('Estimate')).not.toBeInTheDocument()
    expect(container.firstElementChild).toHaveAttribute('data-estimated', 'false')
    expect(screen.getByRole('meter').getAttribute('aria-valuetext')).not.toContain('estimate')
  })

  it('has no progress to show without an end time, only a labelled picture of the facts', () => {
    render(<EpochClock index={91} startedAt={NOW - 5 * H} blocksSoFar={2480} estimated />)
    expect(screen.queryByRole('meter')).not.toBeInTheDocument()
    const picture = screen.getByRole('img')
    expect(picture.getAttribute('aria-label')).toContain('2,480 blocks so far')
    expect(picture.getAttribute('aria-label')).toContain('End time not known yet')
    expect(screen.getByText('End time not known yet')).toBeInTheDocument()
  })

  it('fills the track at the end and says an estimated epoch is about to end', () => {
    render(
      <EpochClock index={90} startedAt={NOW - 170 * H} expectedEndAt={NOW - 2 * H} estimated />,
    )
    const track = screen.getByRole('meter')
    expect(track).toHaveAttribute('aria-valuenow', '100')
    expect(screen.getByText('Any moment now')).toBeInTheDocument()
    expect(track.getAttribute('aria-valuetext')).toContain('Expected to end any moment now')
  })

  it('says when a fixed end has passed', () => {
    render(
      <EpochClock
        index={86}
        startedAt={NOW - 190 * H}
        expectedEndAt={NOW - 5 * H}
        estimated={false}
      />,
    )
    expect(screen.getByText(/^Ended/)).toHaveTextContent('Ended 5 h ago')
  })

  it('sets the size', () => {
    const { container, rerender } = render(
      <EpochClock index={1} startedAt={NOW - H} expectedEndAt={NOW + H} estimated />,
    )
    expect(container.firstElementChild).toHaveAttribute('data-size', 'lg')
    rerender(
      <EpochClock index={1} startedAt={NOW - H} expectedEndAt={NOW + H} estimated size="md" />,
    )
    expect(container.firstElementChild).toHaveAttribute('data-size', 'md')
  })
})
