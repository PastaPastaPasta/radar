import type { ReactNode } from 'react'
import type { CoreTxType, TransitionType } from '@/lib/tx-types'
import { cx, layerAttr } from './cx'
import { Icon } from './icon'
import { typeMeta } from './kinds'
import type { Tone } from './types'

export interface BadgeProps {
  tone?: Tone
  icon?: ReactNode
  children: ReactNode
  size?: 'sm' | 'md'
}

const TONE_CLASS: Record<Tone, string | undefined> = {
  neutral: undefined,
  info: 'dh-badge--info',
  success: 'dh-badge--good',
  warning: 'dh-badge--warn',
  danger: 'dh-badge--bad',
}

export function Badge({ tone = 'neutral', icon, children, size = 'md' }: BadgeProps) {
  return (
    <span
      className={cx('dh-badge', TONE_CLASS[tone], size === 'sm' && 'rx-badge--sm')}
      data-tone={tone}
    >
      {icon}
      {children}
    </span>
  )
}

export interface TypeBadgeProps {
  type: CoreTxType | TransitionType
}

export function TypeBadge({ type }: TypeBadgeProps) {
  const meta = typeMeta(type)
  return (
    <span className="rx-type" data-layer={layerAttr(meta.layer)} data-type={type}>
      <Icon name={meta.icon} />
      {meta.label}
    </span>
  )
}
