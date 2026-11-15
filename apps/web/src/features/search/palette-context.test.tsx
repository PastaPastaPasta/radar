import { act, renderHook } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { renderInRouter } from '@/ui/test-utils'
import { CommandPaletteProvider, useCommandPalette } from './palette-context'

function Probe() {
  const palette = useCommandPalette()
  return (
    <>
      <output data-open={String(palette.isOpen)}>{palette.initialQuery}</output>
      <button type="button" onClick={palette.ready}>
        mounted
      </button>
    </>
  )
}

describe('the search box opened with "/" @W2-29 @IN-10', () => {
  it('keeps the keys typed before its code has loaded', async () => {
    const user = userEvent.setup()
    await renderInRouter(
      <CommandPaletteProvider>
        <Probe />
      </CommandPaletteProvider>,
    )
    const container = document.body
    await user.keyboard('/Xb')
    const out = container.querySelector('output')!
    expect(out).toHaveAttribute('data-open', 'true')
    expect(out).toHaveTextContent('Xb')
    await user.keyboard('{Backspace}u')
    expect(out).toHaveTextContent('Xu')

    await user.click(container.querySelector('button')!)
    await user.keyboard('zz')
    expect(out).toHaveTextContent('Xu')
  })

  it('has a no-op ready outside a provider', () => {
    const { result } = renderHook(() => useCommandPalette())
    act(() => result.current.ready())
    expect(result.current.isOpen).toBe(false)
  })
})
