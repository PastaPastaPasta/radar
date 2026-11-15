import { t } from '@lingui/core/macro'
import { Link, type LinkProps } from '@tanstack/react-router'
import { useCallback, useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import { formatInt } from '@/lib/format'
import { layerAttr } from './cx'
import type { Layer } from './types'

export interface TabsProps {
  tabs: { id: string; label: ReactNode; count?: number; disabled?: boolean }[]
  value: string
  to: (id: string) => LinkProps
  layer?: Layer
}

/** Marks which edges of the bar have more tabs beyond them, so the stylesheet fades exactly those. */
function markOverflow(el: HTMLElement) {
  const max = el.scrollWidth - el.clientWidth
  el.dataset.moreStart = String(el.scrollLeft > 1)
  el.dataset.moreEnd = String(max > 1 && el.scrollLeft < max - 1)
}

export function Tabs({ tabs, value, to, layer }: TabsProps) {
  const ref = useRef<HTMLUListElement>(null)
  const update = useCallback(() => {
    if (ref.current) markOverflow(ref.current)
  }, [])
  // The current tab is brought into view inside the bar only; the page itself never scrolls for it.
  useLayoutEffect(() => {
    const bar = ref.current
    const current = bar?.querySelector<HTMLElement>('[aria-current="page"]')
    if (bar && current) {
      const left = current.offsetLeft - bar.offsetLeft
      const fits =
        left >= bar.scrollLeft && left + current.offsetWidth <= bar.scrollLeft + bar.clientWidth
      if (!fits) bar.scrollLeft = Math.max(0, left - (bar.clientWidth - current.offsetWidth) / 2)
    }
    update()
  }, [value, tabs.length, update])
  useEffect(() => {
    const bar = ref.current
    if (!bar || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(update)
    observer.observe(bar)
    return () => {
      observer.disconnect()
    }
  }, [update])
  return (
    <div className="rx-tabbar">
      <div className="dh-container">
        <nav aria-label={t`Sections`} data-layer={layerAttr(layer)}>
          <ul className="rx-tabs" ref={ref} onScroll={update}>
            {tabs.map((tab) => (
              <li key={tab.id}>
                {tab.disabled ? (
                  <span
                    className="rx-tabs__off"
                    aria-disabled="true"
                    title={t`Not available for this record`}
                  >
                    {tab.label}
                  </span>
                ) : (
                  <Link
                    {...to(tab.id)}
                    activeOptions={{ exact: true, includeHash: true }}
                    activeProps={{}}
                    inactiveProps={{}}
                    aria-current={tab.id === value ? 'page' : undefined}
                  >
                    {tab.label}
                    {tab.count === undefined ? null : (
                      <span className="rx-count">{formatInt(tab.count)}</span>
                    )}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  )
}
