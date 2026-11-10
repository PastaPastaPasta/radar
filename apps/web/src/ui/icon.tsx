import { createElement, type ReactElement } from 'react'
import { cx } from './cx'
import { ICON_PATHS, type IconName } from './icon-paths'

export type { IconName }

export interface IconProps {
  name: IconName
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const SHAPE = /<(\w+)((?:\s+[\w-]+="[^"]*")*)\s*\/>/g
const ATTR = /([\w-]+)="([^"]*)"/g

const shapesCache = new Map<IconName, ReactElement[]>()

function shapesOf(name: IconName): ReactElement[] {
  const hit = shapesCache.get(name)
  if (hit) return hit
  const shapes = [...ICON_PATHS[name].matchAll(SHAPE)].map((m, i) => {
    const props: Record<string, string> = { key: String(i) }
    for (const a of (m[2] ?? '').matchAll(ATTR)) props[a[1] ?? ''] = a[2] ?? ''
    return createElement(m[1] ?? 'path', props)
  })
  shapesCache.set(name, shapes)
  return shapes
}

export function Icon({ name, size = 'md', className }: IconProps) {
  return (
    <svg
      className={cx(
        'rx-ico',
        size === 'sm' && 'rx-ico--sm',
        size === 'lg' && 'rx-ico--lg',
        className,
      )}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      {shapesOf(name)}
    </svg>
  )
}
