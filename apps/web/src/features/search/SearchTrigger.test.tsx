import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderInRouter } from '@/ui/test-utils'
import { I18nProvider, i18n } from '@/i18n'
import { SearchTrigger } from './SearchTrigger'

describe('the search trigger @W2-63 @HY-18', () => {
  it('shows the "/" key chip only where a pointer can hover, so not on a touch screen', async () => {
    await renderInRouter(
      <I18nProvider i18n={i18n}>
        <SearchTrigger />
      </I18nProvider>,
    )
    const chip = screen.getByRole('link', { name: /Search Radar/ }).querySelector('kbd')
    expect(chip).toHaveClass('[@media(hover:none)]:hidden')
  })
})
