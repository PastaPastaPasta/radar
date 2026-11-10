import { Link, type LinkProps } from '@tanstack/react-router'
import { useEffect, useRef, type ReactNode } from 'react'
import { formatInt } from '@/lib/format'
import { layerAttr } from './cx'
import type { Layer } from './types'

export interface TabsProps {
  tabs: { id: string; label: ReactNode; count?: number; disabled?: boolean }[]
  value: string
  to: (id: string) => LinkProps
  layer?: Layer
}

export function Tabs({ tabs, value, to, layer }: TabsProps) {
  const ref = useRef<HTMLUListElement>(null)
  useEffect(() => {
    const current = ref.current?.querySelector('[aria-current="page"]')
    current?.scrollIntoView?.({ inline: 'nearest', block: 'nearest' })
  }, [value])
  return (
    <div className="rx-tabbar">
      <div className="dh-container">
        <nav aria-label="Sections" data-layer={layerAttr(layer)}>
          <ul className="rx-tabs" ref={ref}>
            {tabs.map((tab) => (
              <li key={tab.id}>
                {tab.disabled ? (
                  <span
                    className="rx-tabs__off"
                    aria-disabled="true"
                    title="Not available for this record"
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
