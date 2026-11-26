import { screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { I18nProvider, i18n } from '@/i18n'
import { renderInRouter as renderBare } from '@/ui/test-utils'
import { Answer, SegBar, shareTone } from './bars'

const renderInRouter = (node: ReactNode) =>
  renderBare(<I18nProvider i18n={i18n}>{node}</I18nProvider>)

const parts = [
  { key: 'yes', name: 'Answered', n: 98, color: '#167a46', link: { to: '/masternodes' as const } },
  { key: 'no', name: "Didn't answer", n: 2, color: '#c0392b' },
  { key: 'none', name: 'Not checked', n: 0, color: '#7a8b98' },
]

describe('SegBar', () => {
  it('names the whole reading on the bar and leaves out empty parts', async () => {
    await renderInRouter(<SegBar label="Reachability" parts={parts} />)
    expect(
      screen.getByRole('img', { name: "Reachability: Answered 98.0%, Didn't answer 2.0%" }),
    ).toBeTruthy()
    expect(document.querySelectorAll('[data-part]')).toHaveLength(2)
  })

  it('links the legend items that have a list behind them and counts each part', async () => {
    await renderInRouter(<SegBar label="Reachability" parts={parts} />)
    const link = screen.getByRole('link', { name: /^Answered/ })
    expect(link.getAttribute('href')).toBe('/masternodes')
    expect(link.textContent).toContain('98')
    expect(screen.queryByRole('link', { name: /^Didn't answer/ })).toBeNull()
  })

  it('draws nothing when there is nothing to share out', async () => {
    const { container } = await renderInRouter(
      <SegBar label="Empty" parts={[{ key: 'a', name: 'A', n: 0, color: '#000000' }]} />,
    )
    expect(container.querySelector('[data-nbar]')).toBeNull()
  })

  it('keeps the legend to shares when asked, and can drop it', async () => {
    const { container } = await renderInRouter(
      <>
        <SegBar label="Shares" legend="share" parts={parts} />
        <SegBar label="Bare" legend="none" parts={parts} />
      </>,
    )
    const [shares, bare] = container.querySelectorAll('[data-nbar]')
    expect(shares!.querySelector('[data-legend="yes"]')!.textContent).not.toContain('98 ')
    expect(bare!.querySelector('ul')).toBeNull()
  })
})

describe('Answer', () => {
  it('gives a status its colour and a count none', async () => {
    const { container } = await renderInRouter(
      <>
        <Answer tone="good" pill="99% ready" />
        <Answer tone="neutral" pill="43 countries" />
      </>,
    )
    const [status, count] = container.querySelectorAll('.dh-pill')
    expect(status!.className).toContain('dh-pill--good')
    expect(count!.className).not.toContain('dh-pill--')
  })

  it('reads a share as good from 98 %, warn from 90 % and bad below', () => {
    expect(shareTone(0.98)).toBe('good')
    expect(shareTone(0.9)).toBe('warn')
    expect(shareTone(0.899)).toBe('bad')
  })
})
