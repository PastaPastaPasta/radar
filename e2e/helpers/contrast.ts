import type { Page } from '@playwright/test'

export interface LowContrast {
  text: string
  ratio: number
  fontSize: number
  element: string
}

/**
 * Every visible, enabled text node whose colour, composited over the opaque ground behind it, is below WCAG AA
 * (4.5:1, or 3:1 for large text). Axe skips text that sits over a gradient or an image, so this walks the
 * backgrounds itself.
 */
export async function lowContrastText(page: Page): Promise<LowContrast[]> {
  return page.evaluate(() => {
    interface Rgba {
      r: number
      g: number
      b: number
      a: number
    }
    const parse = (value: string): Rgba | null => {
      const m = /rgba?\(([^)]+)\)/.exec(value)
      if (!m?.[1]) return null
      const [r = 0, g = 0, b = 0, a = 1] = m[1]
        .split(/[ ,/]+/)
        .filter(Boolean)
        .map(Number)
      return { r, g, b, a }
    }
    const over = (f: Rgba, bg: Rgba): Rgba => ({
      r: f.r * f.a + bg.r * (1 - f.a),
      g: f.g * f.a + bg.g * (1 - f.a),
      b: f.b * f.a + bg.b * (1 - f.a),
      a: 1,
    })
    const channel = (v: number) => {
      const s = v / 255
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
    }
    const luminance = (c: Rgba) =>
      0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b)
    const ratio = (a: Rgba, b: Rgba) => {
      const [hi = 0, lo = 0] = [luminance(a), luminance(b)].sort((x, y) => y - x)
      return (hi + 0.05) / (lo + 0.05)
    }
    const ground = (el: Element): Rgba => {
      const layers: Rgba[] = []
      for (let e: Element | null = el; e; e = e.parentElement) {
        const c = parse(getComputedStyle(e).backgroundColor)
        if (c && c.a > 0) layers.push(c)
        if (c && c.a >= 1) break
      }
      const root = parse(getComputedStyle(document.body).backgroundColor)
      let bg: Rgba = root && root.a >= 1 ? root : { r: 255, g: 255, b: 255, a: 1 }
      for (const c of layers.reverse()) bg = over(c, bg)
      return bg
    }
    const opacity = (el: Element) => {
      let o = 1
      for (let e: Element | null = el; e; e = e.parentElement)
        o *= Number(getComputedStyle(e).opacity)
      return o
    }
    const found: { text: string; ratio: number; fontSize: number; element: string }[] = []
    const seen = new Set<Element>()
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = n.textContent?.trim()
      const el = n.parentElement
      if (!text || !el || seen.has(el)) continue
      seen.add(el)
      const style = getComputedStyle(el)
      const box = el.getBoundingClientRect()
      if (box.width === 0 || box.height === 0 || style.visibility === 'hidden') continue
      if (el.closest('.sr-only, .dh-sr, :disabled, [aria-disabled="true"]')) continue
      const fg = parse(style.color)
      if (!fg) continue
      const bg = ground(el)
      const shown = over({ ...fg, a: fg.a * opacity(el) }, bg)
      const fontSize = parseFloat(style.fontSize)
      const large = fontSize >= 24 || (fontSize >= 18.66 && Number(style.fontWeight) >= 700)
      const r = ratio(shown, bg)
      if (r < (large ? 3 : 4.5)) {
        found.push({
          text: text.slice(0, 40),
          ratio: Math.round(r * 100) / 100,
          fontSize,
          element: `${el.tagName.toLowerCase()}.${String(el.getAttribute('class') ?? '')}`,
        })
      }
    }
    return found
  })
}

/** The phone tab bar's height, safe-area inset included, as the shell publishes it. */
export async function tabBarHeight(page: Page): Promise<number> {
  return page.evaluate(() => {
    const probe = document.createElement('div')
    probe.style.cssText = 'position:absolute;visibility:hidden;height:var(--dh-tabs-h, 0px)'
    document.body.append(probe)
    const height = probe.getBoundingClientRect().height
    probe.remove()
    return height
  })
}
