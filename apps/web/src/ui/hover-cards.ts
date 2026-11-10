import type { ComponentType } from 'react'
import type { EntityKind } from './types'

const registry = new Map<EntityKind, ComponentType<{ id: string }>>()

export function registerHoverCard(kind: EntityKind, C: ComponentType<{ id: string }>): void {
  registry.set(kind, C)
}

export function getHoverCard(kind: EntityKind): ComponentType<{ id: string }> | undefined {
  return registry.get(kind)
}
