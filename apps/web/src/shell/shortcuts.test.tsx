import { act, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { renderInApp } from '@/features/entity/test-utils'
import { forgetDevFlags, setDevFlag } from '@/features/you/dev-flags'
import { ShortcutsProvider } from './shortcuts'

afterEach(() => {
  forgetDevFlags()
})

async function openSheet() {
  await renderInApp(
    <ShortcutsProvider>
      <p>page</p>
    </ShortcutsProvider>,
  )
  fireEvent.keyDown(document.body, { key: '?' })
}

describe('shortcut sheet', () => {
  it('lists the proof inspector and diagnostics shortcuts @X-07', async () => {
    await openSheet()
    expect(await screen.findByText('Open the proof inspector')).toBeTruthy()
    expect(screen.getByText('Open the diagnostics drawer')).toBeTruthy()
  })

  it('hides a shortcut the developer settings have turned off @X-07', async () => {
    act(() => setDevFlag('proofShortcut', false))
    await openSheet()
    expect(await screen.findByText('Open the diagnostics drawer')).toBeTruthy()
    expect(screen.queryByText('Open the proof inspector')).toBeNull()
  })
})
