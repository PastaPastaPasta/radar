import { createContext, createElement, useContext, type ComponentType, type ReactNode } from 'react'
import type { EntityKind } from './types'

const registry = new Map<EntityKind, ComponentType<{ id: string }>>()

export function registerHoverCard(kind: EntityKind, C: ComponentType<{ id: string }>): void {
  registry.set(kind, C)
}

export function getHoverCard(kind: EntityKind): ComponentType<{ id: string }> | undefined {
  return registry.get(kind)
}

type HoverCardMap = Partial<Record<EntityKind, ComponentType<{ id: string }>>>

const ScopeContext = createContext<HoverCardMap | undefined>(undefined)

/** Cards inside a scope win over the registry without changing it. */
export function HoverCardScope({ cards, children }: { cards: HoverCardMap; children: ReactNode }) {
  return createElement(ScopeContext.Provider, { value: cards }, children)
}

export function useHoverCard(kind: EntityKind): ComponentType<{ id: string }> | undefined {
  const scope = useContext(ScopeContext)
  return scope?.[kind] ?? registry.get(kind)
}

export function clearHoverCards(): void {
  registry.clear()
}
