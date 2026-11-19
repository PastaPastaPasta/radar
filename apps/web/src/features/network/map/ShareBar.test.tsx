import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { I18nProvider, i18n } from '@/i18n'
import { concentration } from './map-model'
import { ShareBar } from './ShareBar'

const bar = (groups: number) =>
  render(
    <I18nProvider i18n={i18n}>
      <ShareBar
        title="Countries"
        c={concentration(
          Array.from({ length: groups }, (_, i) => ({ key: `g${String(i)}`, n: 10 - i })),
          0,
        )}
        name={(s) => s.key}
        plain={(s) => s.key}
        share={(n) => String(n)}
        unknown="No location"
      />
    </I18nProvider>,
  )

describe('a share bar @RA-50', () => {
  it('counts the rest with the right noun', () => {
    bar(6)
    expect(screen.getByText('1 other')).toBeInTheDocument()
  })

  it('says others for more than one', () => {
    bar(8)
    expect(screen.getByText('3 others')).toBeInTheDocument()
  })
})
