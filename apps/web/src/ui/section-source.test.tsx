import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DataTable } from './data-table'
import { Card, KeyValue, Section, SectionSources, SourceSection } from './layout'
import { NoSourceSection } from './section-source'
import { Stat, Stats } from './stat'
import { stamp } from './test-utils'

const now = Date.now()
const dapi = stamp({ source: 'dapi', asOf: now - 2000, fetchedAt: now - 2000 })
const hyphen = stamp({ source: 'hyphen', asOf: now - 5000, fetchedAt: now - 5000 })
const proved = stamp({ source: 'sdk', proved: true })

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

  it('lets the stamps a section is given speak for their sources @IN-09', () => {
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

  it('keeps a stat’s own mark for hover and focus, out of the resting layout @IN-09', () => {
    render(
      <Section title="Platform">
        <Stats>
          <Stat label="Height" value="1" source={proved} />
          <Stat label="Epoch" value="2" source={proved} />
        </Stats>
      </Section>,
    )
    const stats = [...document.querySelectorAll<HTMLElement>('.rx-stat')]
    expect(stats).toHaveLength(2)
    for (const stat of stats) {
      expect(stat).toHaveAttribute('data-src-hover')
      expect(stat.querySelector('.rx-fig__src [data-source="sdk"]')).not.toBeNull()
      expect(stat.querySelector('.rx-stat__label [data-source]')).toBeNull()
    }
    expect(line().querySelectorAll('[data-source="sdk"]')).toHaveLength(1)
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
