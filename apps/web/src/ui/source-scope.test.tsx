import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Card, KeyValue } from './layout'
import { SourceLine } from './states'
import { Stat, Stats } from './stat'
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
})
