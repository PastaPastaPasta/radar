import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { I18nProvider, i18n } from '@/i18n'
import { SpendState } from './IoTables'
import type { OutputSpend } from './spend'

const reasons = ['loading', 'unconfirmed', 'no-index', 'not-reported', 'behind'] as const

describe('SpendState', () => {
  it.each(reasons)('names the reason an output is unknown: %s @HY-07', (reason) => {
    const spend: OutputSpend = {
      state: 'unknown',
      reason,
      ...(reason === 'behind' ? { behind: 3 } : {}),
    }
    const { container } = render(
      <I18nProvider i18n={i18n}>
        <SpendState spend={spend} index={0} />
      </I18nProvider>,
    )
    const el = container.querySelector('[data-spend="unknown"]')
    expect(el?.getAttribute('data-spend-reason')).toBe(reason)
  })
})
