import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Icon, type IconName } from './icon'
import { ICON_PATHS } from './icon-paths'

describe('Icon', () => {
  it('renders every icon as React-built shapes that match its static markup', () => {
    for (const name of Object.keys(ICON_PATHS) as IconName[]) {
      const { container, unmount } = render(<Icon name={name} />)
      const svg = container.querySelector('svg')
      const expected = (ICON_PATHS[name].match(/<\w+/g) ?? []).length
      expect(svg?.children.length, name).toBe(expected)
      expect(expected, name).toBeGreaterThan(0)
      unmount()
    }
  })

  it('keeps each shape attribute', () => {
    const { container } = render(<Icon name="clock" size="sm" className="x" />)
    const circle = container.querySelector('circle')
    expect(circle?.getAttribute('r')).toBe('8.5')
    expect(container.querySelector('path')?.getAttribute('d')).toBe('M12 7v5l3.2 2')
    expect(container.querySelector('svg')?.getAttribute('class')).toBe('rx-ico rx-ico--sm x')
  })
})
