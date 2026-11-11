import { t } from '@lingui/core/macro'
import type { ReactNode } from 'react'
import { linkOutUrl, type LinkOutTarget } from '@/lib/linkouts'
import { LayerTile } from './art'
import { Icon } from './icon'
import type { IconName } from './icon-paths'

export interface LinkOutProps {
  to: LinkOutTarget
  children?: ReactNode
}

interface AppMeta {
  label: string
  icon: IconName
  className: string
}

const APPS: Record<LinkOutTarget['app'], AppMeta> = {
  gov: { label: 'Governance', icon: 'vote', className: 'rx-tile--gov' },
  bridge: { label: 'Bridge', icon: 'bridge', className: 'rx-tile--bridge' },
  pe: { label: 'Platform Explorer', icon: 'index', className: '' },
  hyphen: { label: 'Hyphen', icon: 'index', className: '' },
  insight: { label: 'Insight', icon: 'block', className: '' },
}

export function LinkOut({ to, children }: LinkOutProps) {
  const href = linkOutUrl(to)
  if (!href) return null
  const app = APPS[to.app]
  const actionApp = to.app === 'gov' || to.app === 'bridge'
  const text = children ?? app.label
  if (actionApp) {
    return (
      <a className="rx-out" href={href} target="_blank" rel="noopener noreferrer" data-app={to.app}>
        <LayerTile layer="neutral" icon={app.icon} size={24} className={app.className} />
        {text}
        <Icon name="ext" className="rx-ext" />
        <span className="dh-sr"> {t`(opens in a new tab)`}</span>
      </a>
    )
  }
  return (
    <a
      className="rx-go-ext"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-app={to.app}
    >
      {text}
      <Icon name="ext" size="sm" className="rx-ext" />
      <span className="dh-sr"> {t`(opens in a new tab)`}</span>
    </a>
  )
}

export interface LinkOutCardProps {
  to: LinkOutTarget
  title: ReactNode
  description: ReactNode
}

/** The home page's "Act on what you see" card. */
export function LinkOutCard({ to, title, description }: LinkOutCardProps) {
  const href = linkOutUrl(to)
  if (!href) return null
  const app = APPS[to.app]
  return (
    <a
      className="rx-out__card"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-app={to.app}
    >
      <LayerTile layer="neutral" icon={app.icon} size={40} className={app.className} />
      <span className="rx-out__t">{title}</span>
      <span className="rx-out__d">{description}</span>
      <Icon name="ext" className="rx-ext" />
      <span className="dh-sr"> {t`(opens in a new tab)`}</span>
    </a>
  )
}
