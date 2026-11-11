import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Amount, Time } from './amount'
import { Badge, TypeBadge } from './badges'
import { Icon } from './icon'
import { Meter, Sparkline, Stat } from './stat'
import { Tabs } from './tabs'
import { UnitsProvider } from './units-context'
import { AmountDensity } from './units-context'
import { NOW, renderInRouter, stamp } from './test-utils'

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(NOW)
})
afterEach(() => {
  vi.useRealTimers()
})

describe('Stat', () => {
  it('shows the label, value and note', () => {
    render(<Stat label="Height" value="2,569,992" note="ChainLocked 12 s ago" layer="core" />)
    expect(screen.getByText('Height')).toBeInTheDocument()
    expect(screen.getByText('2,569,992')).toBeInTheDocument()
    expect(screen.getByText('ChainLocked 12 s ago')).toBeInTheDocument()
  })

  it('carries a tone and says whether a delta is good or worse', () => {
    const { container } = render(
      <>
        <Stat
          label="Answering"
          value="99.1%"
          tone="good"
          delta={{ value: -34, period: 'since yesterday', goodWhen: 'down' }}
        />
        <Stat
          label="Fees"
          value="1"
          delta={{ value: 3, period: 'today', goodWhen: 'down' }}
          tone="warn"
        />
      </>,
    )
    expect(container.querySelector('.rx-stat--good')).not.toBeNull()
    expect(container.querySelector('.rx-stat--warn')).not.toBeNull()
    expect(screen.getByText(/since yesterday/)).toHaveTextContent('−34 since yesterday, good')
    expect(screen.getByText(/today/)).toHaveTextContent('+3 today, worse')
  })

  it('does not judge a delta when told neither direction is better', () => {
    render(<Stat label="Blocks" value="9" delta={{ value: 5, period: 'this week' }} />)
    expect(screen.getByText(/this week/)).toHaveTextContent('+5 this week')
    expect(screen.queryByText(/, good|, worse/)).toBeNull()
  })

  it('draws a meter and a sparkline inside', () => {
    render(
      <Stat
        label="Quorum-ready"
        value="82%"
        meter={{ value: 82, max: 100 }}
        spark={[1, 3, 2, 5]}
      />,
    )
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '82')
    expect(screen.getByRole('img')).toBeInTheDocument()
  })

  it('becomes a link when given an href', () => {
    render(<Stat label="Masternodes" value="2,207" href="/masternodes" />)
    expect(screen.getByRole('link', { name: /Masternodes/ })).toHaveAttribute(
      'href',
      '/masternodes',
    )
  })

  it('shows a source mark beside the figure', () => {
    const { container } = render(<Stat label="Height" value="1" source={stamp()} />)
    expect(container.querySelector('[data-source="dapi"]')).not.toBeNull()
  })

  it('shows a skeleton while loading', () => {
    const { container } = render(<Stat label="Height" value="1" loading />)
    expect(container.querySelector('[data-skeleton]')).not.toBeNull()
    expect(container.firstElementChild).toHaveAttribute('aria-busy', 'true')
  })
})

describe('Meter', () => {
  it('exposes its value to assistive technology', () => {
    render(<Meter value={18} max={100} label="Epoch 88" format={(v) => `${v}% through`} />)
    const meter = screen.getByRole('meter', { name: 'Epoch 88' })
    expect(meter).toHaveAttribute('aria-valuemin', '0')
    expect(meter).toHaveAttribute('aria-valuemax', '100')
    expect(meter).toHaveAttribute('aria-valuetext', '18% through')
  })

  it('takes its tone from the thresholds and clamps the fill', () => {
    const { container } = render(
      <Meter
        value={150}
        max={100}
        label="Readiness"
        thresholds={[
          { at: 0, tone: 'danger' },
          { at: 80, tone: 'success' },
        ]}
        marker={{ at: 80, label: 'Target 80%' }}
      />,
    )
    expect(container.querySelector('.rx-meter--good')).not.toBeNull()
    expect(container.querySelector<HTMLElement>('.rx-meter > i')?.style.width).toBe('100%')
    expect(container.querySelector<HTMLElement>('.rx-meter__mark')?.style.left).toBe('80%')
    expect(screen.getByText('Target 80%')).toBeInTheDocument()
  })
})

describe('Sparkline', () => {
  it('is an image with a text summary of its points', () => {
    render(<Sparkline values={[2, 4, 3, 9]} label="Blocks per hour" />)
    const img = screen.getByRole('img', { name: 'Blocks per hour' })
    expect(img).toHaveAccessibleDescription(/4 points, from 2 to 9, low 2, high 9/)
  })

  it('renders nothing for no data', () => {
    const { container } = render(<Sparkline values={[]} label="Nothing" />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('Amount', () => {
  it('shows four decimals in prose and eight, with the tail dimmed, in tables', () => {
    const { container } = render(
      <>
        <Amount value={5_000_607_499n} kind="duffs" />
        <AmountDensity value="table">
          <Amount value={5_000_000_000n} kind="duffs" />
        </AmountDensity>
      </>,
    )
    const [prose, table] = Array.from(container.querySelectorAll('.rx-amt'))
    expect(prose).toHaveTextContent('50.0061 DASH')
    expect(table).toHaveTextContent('50.00000000 DASH')
    expect(table?.querySelector('.rx-d2')).toHaveTextContent('0000')
  })

  it('formats credits and shows the raw count as a tooltip', () => {
    render(<Amount value={1_013_331_591_984n} kind="credits" />)
    const el = document.querySelector('.rx-amt')
    expect(el).toHaveTextContent('10.1333 DASH')
    expect(el).toHaveAttribute('title', '1,013,331,591,984 credits')
  })

  it('signs, and adds fiat only when a rate is known and the network is mainnet', () => {
    const { rerender, container } = render(
      <UnitsProvider value={{ unit: 'DASH', usdPerDash: 46.2, testnet: false }}>
        <Amount value={5_000_607_499n} kind="duffs" fiat />
      </UnitsProvider>,
    )
    expect(container.querySelector('.rx-fiat')).toHaveTextContent('≈ $2,310')
    rerender(
      <UnitsProvider value={{ unit: 'DASH', testnet: false }}>
        <Amount value={5_000_607_499n} kind="duffs" fiat />
      </UnitsProvider>,
    )
    expect(container.querySelector('.rx-fiat')).toBeNull()
    rerender(
      <UnitsProvider value={{ unit: 'DASH', usdPerDash: 46.2, testnet: true }}>
        <Amount value={100_000_000n} kind="duffs" fiat signed />
      </UnitsProvider>,
    )
    expect(container.querySelector('.rx-fiat')).toBeNull()
    expect(container.querySelector('.rx-amt')).toHaveTextContent('+1 tDASH')
  })

  it('leads with USD and follows with the DASH figure when USD is the primary unit @IN-12', () => {
    const { container, rerender } = render(
      <UnitsProvider value={{ unit: 'DASH', usdPerDash: 46.2, usdPrimary: true, testnet: false }}>
        <Amount value={5_000_607_499n} kind="duffs" />
        <Amount value={-100_000_000n} kind="duffs" />
        <Amount value={100_000_000n} kind="duffs" signed />
      </UnitsProvider>,
    )
    const [a, b, c] = Array.from(container.querySelectorAll('.rx-amt'))
    expect(a).toHaveTextContent('≈ $2,310(50.0061 DASH)')
    expect(a).toHaveAttribute('data-usd')
    expect(a?.querySelector('.rx-fiat')).toHaveTextContent('(50.0061 DASH)')
    expect(b).toHaveTextContent('≈ −$46.2(−1 DASH)')
    expect(c).toHaveTextContent('≈ +$46.2(+1 DASH)')
    expect(a).toHaveAttribute('data-amount', '5000607499')

    rerender(
      <UnitsProvider value={{ unit: 'DASH', usdPerDash: 46.2, usdPrimary: true, testnet: true }}>
        <Amount value={100_000_000n} kind="duffs" />
      </UnitsProvider>,
    )
    expect(container.querySelector('.rx-amt')).toHaveTextContent('1 tDASH')
    expect(container.querySelector('.rx-amt')).not.toHaveTextContent('$')

    rerender(
      <UnitsProvider value={{ unit: 'DASH', testnet: false, usdPrimary: false }}>
        <Amount value={100_000_000n} kind="duffs" />
      </UnitsProvider>,
    )
    expect(container.querySelector('.rx-amt')).toHaveTextContent('1 DASH')
  })

  it('follows the unit preference unless a unit is given', () => {
    render(
      <UnitsProvider value={{ unit: 'mDASH', testnet: false }}>
        <Amount value={74_600_000n} kind="duffs" />
        <Amount value={74_600_000n} kind="duffs" unit="DASH" />
      </UnitsProvider>,
    )
    const [a, b] = Array.from(document.querySelectorAll('.rx-amt'))
    expect(a).toHaveTextContent('746 mDASH')
    expect(b).toHaveTextContent('0.7460 DASH')
  })
})

describe('Time', () => {
  it('shows relative, absolute and both, with the ISO time as the tooltip', () => {
    const ms = NOW - 8 * 60_000
    render(
      <>
        <Time ms={ms} />
        <Time ms={ms} mode="absolute" />
        <Time ms={ms} mode="both" />
      </>,
    )
    const times = Array.from(document.querySelectorAll('time'))
    expect(times[0]).toHaveTextContent('8 min ago')
    expect(times[1]).toHaveTextContent('11:52 UTC')
    expect(times[2]).toHaveTextContent('11:52 UTC · 8 min ago')
    expect(times[0]).toHaveAttribute('dateTime', '2026-11-10T11:52:00Z')
  })
})

describe('Badge and TypeBadge', () => {
  it('renders tones, icons and the layer of a type', () => {
    const { container } = render(
      <>
        <Badge tone="success" icon={<Icon name="check" />}>
          Executed
        </Badge>
        <TypeBadge type="identity-create" />
      </>,
    )
    expect(screen.getByText('Executed')).toBeInTheDocument()
    expect(container.querySelector('.dh-badge--good')).toHaveAttribute('data-tone', 'success')
    expect(screen.getByText('Identity create')).toBeInTheDocument()
  })
})

describe('Tabs', () => {
  it('marks the current tab and lists counts, with disabled tabs inert', async () => {
    await renderInRouter(
      <Tabs
        value="documents"
        to={(id) => ({ to: '/', hash: id })}
        tabs={[
          { id: 'transitions', label: 'Transitions', count: 22 },
          { id: 'documents', label: 'Documents', count: 1500 },
          { id: 'tokens', label: 'Tokens', disabled: true },
        ]}
      />,
    )
    const nav = screen.getByRole('navigation', { name: 'Sections' })
    expect(within(nav).getByRole('link', { name: /Documents/ })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(within(nav).getByRole('link', { name: /Transitions/ })).not.toHaveAttribute(
      'aria-current',
    )
    expect(within(nav).getByText('1,500')).toBeInTheDocument()
    const off = within(nav).getByText('Tokens')
    expect(off).toHaveAttribute('aria-disabled', 'true')
    expect(within(nav).getAllByRole('link')).toHaveLength(2)
  })

  it('navigates by link and keyboard', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const { router } = await renderInRouter(
      <Tabs
        value="a"
        to={(id) => ({ to: '/', hash: id })}
        tabs={[
          { id: 'a', label: 'Alpha' },
          { id: 'b', label: 'Beta' },
        ]}
      />,
    )
    await user.tab()
    await user.tab()
    expect(screen.getByRole('link', { name: 'Beta' })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(router.state.location.hash).toBe('b')
  })
})
