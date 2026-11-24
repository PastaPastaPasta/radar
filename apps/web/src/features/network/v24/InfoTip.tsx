import * as Popover from '@radix-ui/react-popover'
import type { ReactNode } from 'react'
import { Icon } from '@/ui'

/** A small info button whose note opens on click, tap or Enter, for the fine print a reading doesn't need at a glance. */
export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Popover.Root>
      <Popover.Trigger className="rx-v24-info" aria-label={label} data-v24-info>
        <Icon name="info" size="sm" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="rx-hc rx-hc--pop rx-v24-tip"
          aria-label={label}
          data-layer="network"
          sideOffset={6}
          collisionPadding={12}
        >
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
