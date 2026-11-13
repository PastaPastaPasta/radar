import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { I18nProvider, i18n } from '@/i18n'
import { ShortcutsProvider } from './shortcuts'

describe('shortcut sheet', () => {
  it('lists the proof inspector and diagnostics shortcuts @X-07', async () => {
    render(
      <I18nProvider i18n={i18n}>
        <ShortcutsProvider>
          <p>page</p>
        </ShortcutsProvider>
      </I18nProvider>,
    )
    fireEvent.keyDown(document.body, { key: '?' })
    expect(await screen.findByText('Open the proof inspector')).toBeTruthy()
    expect(screen.getByText('Open the diagnostics drawer')).toBeTruthy()
  })
})
