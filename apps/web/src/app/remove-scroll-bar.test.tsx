import { render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { RemoveScrollBar } from './remove-scroll-bar'

describe('RemoveScrollBar', () => {
  it('marks the body while mounted, counting nested locks, and adds no <style>', () => {
    const styles = document.querySelectorAll('style').length
    const outer = render(<RemoveScrollBar />)
    expect(document.body.getAttribute('data-scroll-locked')).toBe('1')
    const inner = render(<RemoveScrollBar />)
    expect(document.body.getAttribute('data-scroll-locked')).toBe('2')
    inner.unmount()
    expect(document.body.getAttribute('data-scroll-locked')).toBe('1')
    outer.unmount()
    expect(document.body.hasAttribute('data-scroll-locked')).toBe(false)
    expect(document.querySelectorAll('style').length).toBe(styles)
  })
})

describe('RemoveScrollBar gutter', () => {
  const root = document.documentElement
  const original = Object.getOwnPropertyDescriptor(Element.prototype, 'clientWidth')

  afterEach(() => {
    delete (root as { clientWidth?: number }).clientWidth
    if (original) Object.defineProperty(Element.prototype, 'clientWidth', original)
  })

  const pageWidth = (clientWidth: number) =>
    Object.defineProperty(root, 'clientWidth', { configurable: true, value: clientWidth })

  it('reserves the gutter when the page had a scrollbar as the lock started', () => {
    pageWidth(window.innerWidth - 15)
    const view = render(<RemoveScrollBar />)
    expect(root.hasAttribute('data-scroll-gutter')).toBe(true)
    view.unmount()
    expect(root.hasAttribute('data-scroll-gutter')).toBe(false)
  })

  it('reserves nothing on a page with no scrollbar', () => {
    pageWidth(window.innerWidth)
    const view = render(<RemoveScrollBar />)
    expect(root.hasAttribute('data-scroll-gutter')).toBe(false)
    view.unmount()
  })

  it('decides once, when the outermost lock starts', () => {
    pageWidth(window.innerWidth)
    const outer = render(<RemoveScrollBar />)
    pageWidth(window.innerWidth - 15)
    const inner = render(<RemoveScrollBar />)
    expect(root.hasAttribute('data-scroll-gutter')).toBe(false)
    inner.unmount()
    outer.unmount()
  })
})
