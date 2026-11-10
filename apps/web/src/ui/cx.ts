import type { CSSProperties } from 'react'
import type { Layer } from './types'

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}

export function layerAttr(layer: Layer | undefined): Exclude<Layer, 'neutral'> | undefined {
  return layer === undefined || layer === 'neutral' ? undefined : layer
}

export function cssVars(vars: Record<`--${string}`, string | number>): CSSProperties {
  return vars
}
