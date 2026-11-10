import type { ComponentType } from 'react'
import { Hash, type EntityKind } from '@/ui'
import { ENTITY_LABELS } from './hrefs'

export function GenericHoverCard(kind: EntityKind): ComponentType<{ id: string }> {
  function HoverCard({ id }: { id: string }) {
    return (
      <div data-hover-card={kind} className="grid gap-1">
        <p className="text-sm text-[var(--dh-ink-2,inherit)]">{ENTITY_LABELS[kind]}</p>
        <Hash value={id} display="wrap" copy={false} />
      </div>
    )
  }
  HoverCard.displayName = `${kind}HoverCard`
  return HoverCard
}
