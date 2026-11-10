import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import {
  CHART_HEIGHT,
  CHART_TOKEN_NAMES,
  radarChartTheme,
  readChartTokens,
  withChartMotion,
} from './chart-theme'
import * as ui from './index'
import { RADAR_MAP_STYLE } from './map-style'

describe('ui exports', () => {
  it.each([
    'Card',
    'SectionBand',
    'KeyValue',
    'QueryView',
    'Stat',
    'Amount',
    'Time',
    'Badge',
    'TypeBadge',
    'Sparkline',
    'Meter',
    'Chart',
    'Hash',
    'EntityChip',
    'Copy',
    'SourceLine',
    'Empty',
    'ErrorState',
    'Skeleton',
    'LiveDot',
    'Tabs',
    'DataTable',
    'LinkOut',
    'registerHoverCard',
  ])('exports %s', (name) => {
    expect(ui).toHaveProperty(name)
  })
})

describe('KeyValue', () => {
  it('lists terms and values with an optional source and hint', () => {
    render(
      <ui.KeyValue
        columns={2}
        items={[
          { label: 'Balance', value: '10 DASH', hint: 'across 3 keys' },
          { label: 'Created', value: '1 Oct' },
        ]}
      />,
    )
    expect(screen.getByText('Balance').tagName).toBe('DT')
    expect(screen.getByText('10 DASH').tagName).toBe('DD')
    expect(screen.getByText('across 3 keys')).toBeInTheDocument()
  })
})

describe('SectionBand', () => {
  it('is a labelled region with a copyable anchor', () => {
    render(
      <ui.SectionBand layer="core" title="Blocks" id="blocks" description="Latest">
        body
      </ui.SectionBand>,
    )
    expect(screen.getByRole('region', { name: 'Blocks' })).toHaveAttribute('data-layer', 'core')
    expect(screen.getByRole('button', { name: 'Copy link to this section' })).toBeInTheDocument()
  })
})

describe('Chart', () => {
  it('names the canvas and offers the data as a table', async () => {
    const user = userEvent.setup()
    render(
      <ui.Chart
        option={{ series: [] }}
        height={200}
        label="Transitions per month"
        table={{
          columns: ['Month', 'Count'],
          rows: [
            ['Sep', 12],
            ['Oct', 18],
          ],
        }}
        loading
      />,
    )
    expect(screen.getByRole('img', { name: 'Transitions per month' })).toBeInTheDocument()
    const toggle = screen.getByRole('button', { name: 'Show as a table' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await user.click(toggle)
    expect(screen.getByRole('button', { name: 'Hide table' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    expect(screen.getByRole('rowheader', { name: 'Oct' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '18' })).toBeInTheDocument()
  })
})

describe('chart theme and map style', () => {
  it('reads each token from the page and falls back to the light values', () => {
    const fallback = readChartTokens()
    expect(Object.keys(fallback)).toEqual([...CHART_TOKEN_NAMES])
    document.documentElement.style.setProperty('--dh-ink', '#112233')
    expect(readChartTokens()['dh-ink']).toBe('#112233')
    document.documentElement.style.removeProperty('--dh-ink')
    expect(readChartTokens()['dh-ink']).toBe(fallback['dh-ink'])
  })

  it('feeds the tokens into the ECharts theme', () => {
    const theme = radarChartTheme({ ...readChartTokens(), 'dh-ink': '#010203' })
    expect(JSON.stringify(theme)).toContain('#010203')
    expect(CHART_HEIGHT.card).toBeLessThan(CHART_HEIGHT.page)
  })

  it('turns animation off for reduced motion', () => {
    expect(withChartMotion({ series: [] }, false).animation).toBeUndefined()
    expect(withChartMotion({ series: [] }, true).animation).toBe(false)
  })

  it('exports the plate map values', () => {
    expect(RADAR_MAP_STYLE.ocean.light).toMatch(/^#/)
    expect(RADAR_MAP_STYLE.sources.lowZoomBelow).toBeGreaterThan(0)
  })
})
