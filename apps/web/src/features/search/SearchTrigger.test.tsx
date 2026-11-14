import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderInRouter } from '@/ui/test-utils'
import { I18nProvider, i18n } from '@/i18n'
import { SearchTrigger } from './SearchTrigger'

const stubHover = (none: boolean) =>
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: none && query === '(hover: none)',
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList,
  )

const mount = () =>
  renderInRouter(
    <I18nProvider i18n={i18n}>
      <SearchTrigger />
    </I18nProvider>,
  )

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the search trigger @W2-63 @HY-18', () => {
  it('shows the "/" key chip where a keyboard can press it', async () => {
    stubHover(false)
    await mount()
    expect(screen.getByRole('link', { name: /Search Radar/ }).querySelector('kbd')).not.toBeNull()
  })

  it('leaves the chip out on a touch screen', async () => {
    stubHover(true)
    await mount()
    expect(screen.getByRole('link', { name: /Search Radar/ }).querySelector('kbd')).toBeNull()
  })
})
