import { describe, expect, it } from 'vitest'
import { BAR_OVERLAY_CSS, adoptBarOverlay } from './bar-overlay'

describe('phone header overlay @IN-16 @HY-17 @HY-18', () => {
  it('anchors the network menu to the bar, not to the pill, and keeps the network name visible', () => {
    expect(BAR_OVERLAY_CSS).toMatch(/\.bar\.compact \.netwrap\s*{\s*position:\s*static/)
    expect(BAR_OVERLAY_CSS).toMatch(/\.bar\.compact \.netpop\s*{[^}]*left:\s*var\(--dh-gutter\)/)
    expect(BAR_OVERLAY_CSS).toMatch(/\.bar\.squeeze \.nl\s*{[^}]*position:\s*static/)
  })

  it('adds its sheet to a bar once and leaves the shell’s own sheet in place', () => {
    const bar = document.createElement('div')
    const root = bar.attachShadow({ mode: 'open' })
    const own = new CSSStyleSheet()
    root.adoptedStyleSheets = [own]

    adoptBarOverlay(bar)
    adoptBarOverlay(bar)

    expect(root.adoptedStyleSheets).toHaveLength(2)
    expect(root.adoptedStyleSheets[0]).toBe(own)
  })

  it('does nothing for a bar that has no shadow root yet', () => {
    expect(() => {
      adoptBarOverlay(document.createElement('div'))
    }).not.toThrow()
  })
})
