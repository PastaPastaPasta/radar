import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
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
