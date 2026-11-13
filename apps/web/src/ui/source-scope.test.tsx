import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Card, KeyValue } from './layout'
import { SourceLine } from './states'
import { BEHIND_GRACE_MS, Stat, Stats } from './stat'
import { stamp } from './test-utils'

const now = Date.now()
const dapi = stamp({ source: 'dapi', asOf: now - 2000, fetchedAt: now - 2000 })
const hyphen = stamp({ source: 'hyphen' })

describe('quiet source badges', () => {
  it('shows one badge for stamps that differ only in time @IN-09', () => {
    const { container } = render(
      <SourceLine
        stamp={[dapi, { ...dapi, asOf: now - 9000 }, { ...dapi, asOf: now - 4000 }]}
        compact
      />,
    )
    expect(container.querySelectorAll('[data-source="dapi"]')).toHaveLength(1)
    expect(screen.getByText('9 s ago')).toBeInTheDocument()
  })

  it('keeps one badge per distinct source and per fallback @IN-09', () => {
    const { container } = render(
      <SourceLine stamp={[dapi, hyphen, { ...hyphen, fallback: 'dapi-down' }]} compact />,
    )
    expect(container.querySelectorAll('[data-source]')).toHaveLength(3)
  })

  it('does not repeat a card’s sources on the figures inside it @IN-09', () => {
    const { container } = render(
      <Card title="Dash Core" source={[dapi, dapi]}>
        <KeyValue
          items={[
            { label: 'Tip', value: '1', source: dapi },
            { label: 'Lock', value: '2', source: dapi },
            { label: 'Rate', value: '3', source: hyphen },
          ]}
        />
        <Stat label="Height" value="4" source={dapi} />
      </Card>,
    )
    expect(container.querySelectorAll('[data-source="dapi"]')).toHaveLength(1)
    expect(container.querySelectorAll('[data-source="hyphen"]')).toHaveLength(1)
  })

  it('shows one badge per source across a row of stats @IN-09', () => {
    const { container } = render(
      <Stats>
        <Stat label="Height" value="1" source={dapi} />
        <Stat label="Difficulty" value="2" source={dapi} />
        <Stat label="Supply" value="3" source={hyphen} />
        <Stat label="Size" value="4" source={hyphen} />
      </Stats>,
    )
    expect(container.querySelectorAll('[data-source="dapi"]')).toHaveLength(1)
    expect(container.querySelectorAll('[data-source="hyphen"]')).toHaveLength(1)
    expect(container.querySelectorAll('.rx-stat')).toHaveLength(4)
  })

  it('keeps the badge of a figure read well before the first one of its source @HY-01', () => {
    const { container } = render(
      <Stats>
        <Stat label="Height" value="1" source={dapi} />
        <Stat label="Difficulty" value="2" source={{ ...dapi, asOf: now - 20 * 60_000 }} />
        <Stat label="Lock" value="3" source={{ ...dapi, asOf: now - 10_000 }} />
      </Stats>,
    )
    expect(container.querySelectorAll('[data-source="dapi"]')).toHaveLength(2)
    expect(screen.getByText('20 min ago')).toBeInTheDocument()
  })

  describe('figures with a height', () => {
    afterEach(() => vi.useRealTimers())

    const row = (tip: number, status: number, statusAsOf: number) => (
      <Stats>
        <Stat label="Height" value={tip} source={{ ...dapi, height: tip }} />
        <Stat
          label="Difficulty"
          value="2"
          source={{ ...dapi, asOf: statusAsOf, fetchedAt: statusAsOf, height: status }}
        />
      </Stats>
    )

    it('shows no badge for a read at the shown height however old its fetch time is @HY-01', () => {
      const { container } = render(row(100, 100, now - 20 * 60_000))
      expect(container.querySelectorAll('[data-source="dapi"]')).toHaveLength(1)
      expect(screen.queryByText('20 min ago')).not.toBeInTheDocument()
    })

    it('waits out the refetch of a new block before showing a badge, and drops it when the read catches up @HY-01', () => {
      vi.useFakeTimers()
      const { container, rerender } = render(row(100, 100, now))
      rerender(row(101, 100, now))
      expect(container.querySelectorAll('[data-source="dapi"]')).toHaveLength(1)
      act(() => void vi.advanceTimersByTime(BEHIND_GRACE_MS - 1))
      expect(container.querySelectorAll('[data-source="dapi"]')).toHaveLength(1)
      act(() => void vi.advanceTimersByTime(2))
      expect(container.querySelectorAll('[data-source="dapi"]')).toHaveLength(2)
      rerender(row(101, 101, now))
      expect(container.querySelectorAll('[data-source="dapi"]')).toHaveLength(1)
    })

    it('shows a badge for a read that stays behind the tip @HY-01', () => {
      vi.useFakeTimers()
      const { container } = render(row(105, 100, now))
      act(() => void vi.advanceTimersByTime(BEHIND_GRACE_MS + 1))
      expect(container.querySelectorAll('[data-source="dapi"]')).toHaveLength(2)
    })
  })
})
