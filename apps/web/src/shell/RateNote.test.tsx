import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider, i18n } from '@/i18n'
import { UnitsProvider, type UnitsValue } from '@/ui'
import { NOW, stamp } from '@/ui/test-utils'
import { RateNote } from './RateNote'

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(NOW)
})
afterEach(() => {
  vi.useRealTimers()
})

const rate = { provider: 'Kraken', stamp: stamp({ source: 'rate', asOf: NOW - 120_000 }) }

function renderNote(value: UnitsValue) {
  return render(
    <I18nProvider i18n={i18n}>
      <UnitsProvider value={value}>
        <RateNote />
      </UnitsProvider>
    </I18nProvider>,
  )
}

describe('RateNote @IN-12', () => {
  it('says the rate, its provider and its age when USD leads', () => {
    renderNote({ unit: 'DASH', usdPerDash: 46.2, rate, usdPrimary: true, testnet: false })
    const note = document.querySelector('[data-rate-note]')
    expect(note).toHaveTextContent('USD at ≈ $46.2 per DASH, from Kraken.')
    expect(note).toHaveTextContent(/Price via Platform Explorer/)
    expect(note).toHaveTextContent('2 min ago')
  })

  it('stays out of the way when DASH leads', () => {
    const { container } = render(
      <I18nProvider i18n={i18n}>
        <UnitsProvider value={{ unit: 'DASH', usdPerDash: 46.2, rate, testnet: false }}>
          <RateNote />
        </UnitsProvider>
      </I18nProvider>,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
