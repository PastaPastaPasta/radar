/*
 * Phone-header rules the vendored shell does not have. They live in a second adopted stylesheet on the bar's open
 * shadow root, so the vendored files stay byte-identical to what the shell publishes.
 */
export const BAR_OVERLAY_CSS = `
.bar.compact .netwrap { position: static; }
.bar.compact .netpop { left: var(--dh-gutter); right: auto; }
.bar.squeeze .nl {
  position: static;
  width: auto;
  height: auto;
  overflow: visible;
  clip: auto;
}
@media (max-width: 359px) {
  .bar.squeeze .nl { display: inline-block; font-size: 0; }
  .bar.squeeze .nl::first-letter { font-size: 13px; }
}
`

let sheet: CSSStyleSheet | null | undefined

function overlaySheet(): CSSStyleSheet | null {
  if (sheet !== undefined) return sheet
  try {
    sheet = new CSSStyleSheet()
    sheet.replaceSync(BAR_OVERLAY_CSS)
  } catch {
    sheet = null
  }
  return sheet
}

/** Adds the overlay to the bar once its shadow root exists; the shell keeps adopted sheets across its re-renders. */
export function adoptBarOverlay(bar: HTMLElement): void {
  const root = bar.shadowRoot
  const overlay = overlaySheet()
  if (!root || !overlay || root.adoptedStyleSheets.includes(overlay)) return
  root.adoptedStyleSheets = [...root.adoptedStyleSheets, overlay]
}
