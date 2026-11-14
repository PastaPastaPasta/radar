import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DataTable } from './data-table'
import { Card, KeyValue, Section, SectionSources, SourceSection } from './layout'
import { BEHIND_GRACE_MS, NoSourceSection } from './section-source'
import { Stat, Stats } from './stat'
import { stamp } from './test-utils'

const openProofInspector = vi.hoisted(() => vi.fn())
vi.mock('./proof', () => ({ openProofInspector }))

afterEach(() => {
  vi.useRealTimers()
})

const now = Date.now()
const radar = stamp({ source: 'radar', asOf: now - 1000, fetchedAt: now - 1000 })
const dapi = stamp({ source: 'dapi', asOf: now - 2000, fetchedAt: now - 2000 })
const hyphen = stamp({ source: 'hyphen', asOf: now - 5000, fetchedAt: now - 5000 })
const proved = stamp({
  source: 'sdk',
  proved: true,
  asOf: now - 1000,
  fetchedAt: now - 1000,
  proof: {
    id: 'a',
    method: 'system.status',
    platformHeight: 1,
    coreChainLockedHeight: 1,
    epoch: 1,
    timeMs: now,
    protocolVersion: 1,
    chainId: 'x',
    quorumType: 1,
    quorumHash: '00',
    round: 0,
    proofBytes: 1,
  },
})

const line = (root: ParentNode = document) =>
  root.querySelector<HTMLElement>('[data-section-sources]')!
const marksOf = (el: ParentNode) =>
  [...el.querySelectorAll('[data-source]')].map((m) => m.getAttribute('data-source'))

describe('a section names its sources once', () => {
  it('collects the sources of every card, row, stat and table inside into one line @IN-09', () => {
    render(
      <Section id="chain" title="On the chain">
        <Card title="Tip" source={dapi}>
          <KeyValue items={[{ label: 'Rate', value: '3', source: hyphen }]} />
        </Card>
        <Card title="Supply" source={[dapi, hyphen]}>
          <DataTable
            columns={[{ id: 'a', header: 'A', accessorFn: (r: { a: string }) => r.a }]}
            rows={[{ a: 'x' }]}
            getRowId={(r) => r.a}
            state="ready"
            caption="Rows"
            source={proved}
          />
        </Card>
      </Section>,
    )
    const section = document.getElementById('chain')!
    expect(section.querySelectorAll('[data-section-sources]')).toHaveLength(1)
    expect(marksOf(line(section)).sort()).toEqual(['dapi', 'hyphen', 'sdk'])
    expect(marksOf(section)).toHaveLength(3)
    expect(line(section).querySelector('[data-source="sdk"]')).toHaveAttribute(
      'data-proved',
      'true',
    )
    expect(section.querySelector('.rx-tfoot')).toBeNull()
  })

  it('shows the age of a figure read well before the rest, so the line never flatters it @IN-09', () => {
    render(
      <Section title="Core">
        <Stat label="Height" value="1" source={dapi} />
        <Stat label="Locked" value="2" source={{ ...dapi, asOf: now - 120_000 }} />
      </Section>,
    )
    expect(line().querySelectorAll('[data-source="dapi"]')).toHaveLength(1)
    expect(line()).toHaveTextContent(/2 min/)
  })

  it('lets the stamps a section is given speak for their sources while its parts are as fresh @IN-09', () => {
    render(
      <Section title="Core" source={[{ ...dapi, asOf: now - 1000 }]}>
        <Stat label="Height" value="1" source={{ ...dapi, asOf: now - 9000 }} />
        <Stat label="Supply" value="2" source={hyphen} />
      </Section>,
    )
    expect(marksOf(line())).toEqual(['dapi', 'hyphen'])
    expect(line()).toHaveTextContent('1 s ago')
    expect(line()).not.toHaveTextContent('9 s ago')
  })

  it('shows a part read well before the section’s own stamp of the same source @IN-09', () => {
    render(
      <Section title="Masternode" source={[{ ...radar, asOf: now - 1000 }]}>
        <Card title="Rewards" source={{ ...radar, asOf: now - 600_000 }}>
          <p>body</p>
        </Card>
      </Section>,
    )
    expect(line().querySelectorAll('[data-source="radar"]')).toHaveLength(1)
    expect(line()).toHaveTextContent('10 min ago')
    expect(line()).not.toHaveTextContent('1 s ago')
  })

  it('shows a part that trails the height of the section’s own stamp, once the grace has passed @IN-09', () => {
    vi.useFakeTimers({ now })
    render(
      <Section title="Core" source={[{ ...dapi, asOf: now - 1000, height: 100 }]}>
        <Stat label="Locked" value="2" source={{ ...dapi, asOf: now - 20_000, height: 98 }} />
      </Section>,
    )
    expect(line()).toHaveTextContent('1 s ago')
    act(() => {
      vi.advanceTimersByTime(BEHIND_GRACE_MS + 100)
    })
    expect(line().querySelectorAll('[data-source="dapi"]')).toHaveLength(1)
    expect(line()).toHaveTextContent(/2[0-9] s ago/)
  })

  it('keeps a trailing part’s grace running when a part before it leaves', () => {
    vi.useFakeTimers({ now })
    const own = [{ ...dapi, asOf: now - 1000, height: 100 }]
    const trailing = (
      <Stat label="Locked" value="2" source={{ ...dapi, asOf: now - 20_000, height: 98 }} />
    )
    const { rerender } = render(
      <Section title="Core" source={own}>
        <Stat key="tip" label="Tip" value="1" source={{ ...hyphen, height: 100 }} />
        <div key="locked">{trailing}</div>
      </Section>,
    )
    act(() => {
      vi.advanceTimersByTime(BEHIND_GRACE_MS - 1000)
    })
    rerender(
      <Section title="Core" source={own}>
        <div key="locked">{trailing}</div>
      </Section>,
    )
    expect(line()).not.toHaveTextContent(/2[0-9] s ago/)
    act(() => {
      vi.advanceTimersByTime(1100)
    })
    expect(line()).toHaveTextContent(/2[0-9] s ago/)
  })

  it('hands the line a part’s new proof when only the proof changed', () => {
    const at = { asOf: now - 1000, fetchedAt: now - 1000 }
    const proof = (id: string) => ({ ...proved.proof!, id })
    const { rerender } = render(
      <Section title="Platform">
        <Stat label="Height" value="1" source={{ ...proved, ...at, proof: proof('a') }} />
      </Section>,
    )
    rerender(
      <Section title="Platform">
        <Stat label="Height" value="1" source={{ ...proved, ...at, proof: proof('b') }} />
      </Section>,
    )
    openProofInspector.mockClear()
    line().querySelector<HTMLElement>('button[data-source="sdk"]')!.click()
    expect(openProofInspector).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }))
  })

  it('says on each part what it handed to the line', () => {
    render(
      <Section id="chain" title="On the chain">
        <Card id="tip" title="Tip" source={[proved, dapi]}>
          <KeyValue items={[{ label: 'Rate', value: '3', source: hyphen }]} />
        </Card>
        <Stat label="Height" value="1" source={proved} />
        <DataTable
          columns={[{ id: 'a', header: 'A', accessorFn: (r: { a: string }) => r.a }]}
          rows={[{ a: 'x' }]}
          getRowId={(r) => r.a}
          state="ready"
          caption="Rows"
          source={hyphen}
        />
      </Section>,
    )
    expect(document.getElementById('tip')).toHaveAttribute('data-reports', 'sdk:proved dapi')
    expect(document.querySelector('.rx-kv [data-reports]')).toHaveAttribute(
      'data-reports',
      'hyphen',
    )
    expect(document.querySelector('.rx-stat')).toHaveAttribute('data-reports', 'sdk:proved')
    expect(document.querySelector('.rx-tablewrap')).toHaveAttribute('data-reports', 'hyphen')
  })

  it('keeps a stat’s own mark out of the resting layout, and within reach of the keyboard and a screen reader @IN-09', () => {
    render(
      <Section title="Platform">
        <Stats>
          <Stat label="Height" value="1" source={proved} />
          <Stat label="Epoch" value="2" source={dapi} />
          <Stat label="Blocks" value="3" source={dapi} href="/blocks" />
        </Stats>
      </Section>,
    )
    const stats = [...document.querySelectorAll<HTMLElement>('.rx-stat')]
    expect(stats).toHaveLength(3)
    for (const stat of stats) {
      expect(stat).toHaveAttribute('data-src-hover')
      const own = stat.querySelector('.rx-fig__src')!
      expect(own.querySelector('[data-source]')).not.toBeNull()
      expect(stat.querySelector('.rx-stat__label [data-source]')).toBeNull()
      expect(stat).toHaveAttribute('aria-describedby', own.id)
      expect(stat).toHaveAccessibleDescription(/Proof-checked|Served by DAPI/)
    }
    const [height, epoch, blocks] = stats
    for (const figure of [height!, epoch!]) {
      expect(figure).toHaveAttribute('tabindex', '0')
      expect(figure).toHaveAttribute('role', 'group')
      figure.focus()
      expect(figure).toHaveFocus()
    }
    expect(height).toHaveAccessibleName('Height')
    expect(height!.querySelector('.rx-fig__src button[data-proved="true"]')).not.toBeNull()
    expect(blocks!.tagName).toBe('A')
    expect(blocks).not.toHaveAttribute('tabindex')
    expect(line().querySelectorAll('[data-source="sdk"]')).toHaveLength(1)
  })

  it('gives a figure outside a section no popover and no tab stop', () => {
    render(<Stat label="Height" value="1" source={dapi} />)
    const stat = document.querySelector('.rx-stat')!
    expect(stat).not.toHaveAttribute('tabindex')
    expect(stat.querySelector('.rx-fig__src')).toBeNull()
    expect(stat.querySelector('.rx-stat__label [data-source="dapi"]')).not.toBeNull()
  })

  it('takes a source back when the part that showed it goes away', () => {
    const { rerender } = render(
      <Section title="Core">
        <Stat label="Height" value="1" source={dapi} />
        <Stat label="Supply" value="2" source={hyphen} />
      </Section>,
    )
    expect(marksOf(line())).toEqual(['dapi', 'hyphen'])
    rerender(
      <Section title="Core">
        <Stat label="Height" value="1" source={dapi} />
      </Section>,
    )
    expect(marksOf(line())).toEqual(['dapi'])
  })

  it('gives each section its own line and the page the rest', () => {
    render(
      <SourceSection>
        <SectionSources className="page" />
        <Stat label="Height" value="1" source={dapi} />
        <Section id="b" title="Index">
          <Stat label="Supply" value="2" source={hyphen} />
        </Section>
      </SourceSection>,
    )
    expect(marksOf(document.querySelector('.page')!)).toEqual(['dapi'])
    expect(marksOf(line(document.getElementById('b')!))).toEqual(['hyphen'])
  })

  it('draws a section-level card with the ruled head and no line of its own', () => {
    render(
      <SourceSection>
        <SectionSources className="page" />
        <Card
          level="section"
          id="versions"
          title="Versions"
          subtitle="What nodes run"
          source={dapi}
        >
          <p>body</p>
        </Card>
      </SourceSection>,
    )
    const card = document.getElementById('versions')!
    expect(card).toHaveClass('rx-sec--ruled')
    expect(screen.getByRole('heading', { level: 2, name: 'Versions' })).toBeInTheDocument()
    expect(card.querySelector('.rx-sec__lede')).toHaveTextContent('What nodes run')
    expect(card.querySelector('[data-source]')).toBeNull()
    expect(marksOf(document.querySelector('.page')!)).toEqual(['dapi'])
  })

  it('leaves a card that stands alone its own mark @IN-09', () => {
    const { container } = render(
      <Card title="Tip" source={dapi}>
        <Stat label="Height" value="1" source={dapi} />
      </Card>,
    )
    expect(container.querySelectorAll('.rx-card__head [data-source="dapi"]')).toHaveLength(1)
    expect(container.querySelector('.rx-fig__src')).toBeNull()
  })

  it('cuts a subtree off from the section, so a hover card keeps its marks', () => {
    render(
      <Section title="Core">
        <NoSourceSection>
          <Stat label="Height" value="1" source={dapi} />
        </NoSourceSection>
      </Section>,
    )
    expect(line().querySelector('[data-source]')).toBeNull()
    expect(document.querySelector('.rx-stat__label [data-source="dapi"]')).not.toBeNull()
  })
})
