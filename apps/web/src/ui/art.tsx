import { base58Decode, isBase58 } from '@/lib/base58'
import { hexToBytes, isHex } from '@/lib/hex'
import { cx, cssVars, layerAttr } from './cx'
import { Icon, type IconName } from './icon'
import type { Layer } from './types'

const FALLBACK_BYTES = 32

function fnv(id: string, salt: number): number {
  let h = 2166136261 ^ salt
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Bytes for an identifier: its own bytes when it is hex or base58, a stable hash otherwise. */
export function idBytes(id: string): Uint8Array {
  try {
    if (isHex(id) && id.length % 2 === 0 && id.length >= 8) return hexToBytes(id)
    if (isBase58(id) && id.length >= 8) {
      const bytes = base58Decode(id)
      if (bytes.length >= 3) return bytes
    }
  } catch {
    // fall through to the hash
  }
  const out = new Uint8Array(FALLBACK_BYTES)
  for (let i = 0; i < FALLBACK_BYTES; i += 4) {
    const h = fnv(id, i)
    out[i] = h & 255
    out[i + 1] = (h >>> 8) & 255
    out[i + 2] = (h >>> 16) & 255
    out[i + 3] = h >>> 24
  }
  return out
}

export interface IdenticonSpec {
  color: number
  cells: [number, number][]
}

/** 5×5 mirrored grid from bytes 1–2, fill from byte 0 mod 8. */
export function identiconSpec(id: string): IdenticonSpec {
  const b = idBytes(id)
  const bits = ((b[1] ?? 0) << 8) | (b[2] ?? 0)
  const cells: [number, number][] = []
  for (let col = 0; col < 3; col++) {
    for (let row = 0; row < 5; row++) {
      if ((bits >> (col * 5 + row)) & 1) {
        cells.push([col, row])
        if (col < 2) cells.push([4 - col, row])
      }
    }
  }
  return { color: (b[0] ?? 0) % 8, cells }
}

export interface IdenticonProps {
  id: string
  size?: number
}

export function Identicon({ id, size = 18 }: IdenticonProps) {
  const { color, cells } = identiconSpec(id)
  return (
    <span
      className={`rx-idc i${color}`}
      style={cssVars({ '--s': `${size}px` })}
      aria-hidden="true"
      data-art="identicon"
    >
      <svg viewBox="-.75 -.75 6.5 6.5" shapeRendering="crispEdges">
        <rect className="bg" x="-.75" y="-.75" width="6.5" height="6.5" />
        {cells.map(([x, y]) => (
          <rect key={`${x}-${y}`} className="c" x={x} y={y} width="1" height="1" />
        ))}
      </svg>
    </span>
  )
}

export interface NodeprintSpec {
  segments: boolean[]
  radius: number
}

const SEGMENTS = 12

/** 12-segment ring from the ProTx hash, every fifth segment always on, centre dot 2.2–3.6. */
export function nodeprintSpec(id: string): NodeprintSpec {
  const b = idBytes(id)
  const bits = ((b[0] ?? 0) << 8) | (b[1] ?? 0)
  const segments = Array.from(
    { length: SEGMENTS },
    (_, i) => i % 5 === 0 || ((bits >> i) & 1) === 1,
  )
  return { segments, radius: 2.2 + ((b[2] ?? 0) / 255) * 1.4 }
}

const R = 9.4
const slot = (Math.PI * 2) / SEGMENTS
const gap = (3 * Math.PI) / 180

function arc(i: number): string {
  const a1 = -Math.PI / 2 + i * slot + gap
  const a2 = -Math.PI / 2 + (i + 1) * slot - gap
  const p = (a: number) => `${(Math.cos(a) * R).toFixed(2)} ${(Math.sin(a) * R).toFixed(2)}`
  return `M${p(a1)}A${R} ${R} 0 0 1 ${p(a2)}`
}

export interface NodeprintProps {
  id: string
  evonode?: boolean
  size?: number
}

export function Nodeprint({ id, evonode = false, size = 18 }: NodeprintProps) {
  const { segments, radius } = nodeprintSpec(id)
  return (
    <span
      className={cx('rx-np', evonode ? 'rx-np--evo' : 'rx-np--mn')}
      style={cssVars({ '--s': `${size}px` })}
      aria-hidden="true"
      data-art="nodeprint"
    >
      <svg viewBox="-12 -12 24 24">
        {segments.map((on, i) => (
          <path key={i} className={on ? 'on' : 'off'} d={arc(i)} />
        ))}
        <circle className="core" r={radius.toFixed(1)} />
      </svg>
    </span>
  )
}

export interface LayerTileProps {
  layer: Layer
  icon: IconName
  size?: number
  className?: string
}

export function LayerTile({ layer, icon, size = 36, className }: LayerTileProps) {
  return (
    <span
      className={cx('rx-tile', className)}
      data-layer={layerAttr(layer)}
      style={cssVars({ '--s': `${size}px` })}
      aria-hidden="true"
    >
      <Icon name={icon} />
    </span>
  )
}

export function LayerGlyph({ layer, icon }: { layer: Layer; icon: IconName }) {
  return (
    <span className="rx-glyph" data-layer={layerAttr(layer)} aria-hidden="true">
      <Icon name={icon} />
    </span>
  )
}
