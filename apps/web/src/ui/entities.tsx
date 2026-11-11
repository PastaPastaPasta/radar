import { t } from '@lingui/core/macro'
import * as HoverCard from '@radix-ui/react-hover-card'
import { createElement, type ReactNode } from 'react'
import { formatInt } from '@/lib/format'
import { Identicon, LayerGlyph, Nodeprint } from './art'
import { cx, layerAttr } from './cx'
import { Copy, ShortText, shortHash } from './hash'
import { useHoverCard } from './hover-cards'
import { KIND_META, labelOf } from './kinds'
import type { EntityKind } from './types'

export interface EntityChipProps {
  kind: EntityKind
  id: string
  label?: ReactNode
  href?: string | false
  copy?: boolean
  hover?: boolean
  size?: 'sm' | 'md'
  identicon?: boolean
}

const MONO_KINDS: ReadonlySet<EntityKind> = new Set([
  'tx',
  'address',
  'platform-address',
  'quorum',
  'transition',
  'document',
  'masternode',
  'evonode',
])

const NUMERIC = /^\d+$/

function nameParts(label: string): ReactNode {
  const dot = label.lastIndexOf('.')
  if (dot <= 0 || label.slice(dot) !== '.dash') return label
  return (
    <>
      {label.slice(0, dot)}
      <span className="rx-tld">{label.slice(dot)}</span>
    </>
  )
}

function chipLabel(
  kind: EntityKind,
  id: string,
  label: ReactNode,
): { node: ReactNode; mono: boolean } {
  if (label !== undefined && label !== null && label !== false) {
    const mono = MONO_KINDS.has(kind) && typeof label === 'string'
    const node = typeof label === 'string' && kind === 'name' ? nameParts(label) : label
    return { node, mono }
  }
  if ((kind === 'block' || kind === 'platform-block') && NUMERIC.test(id)) {
    return { node: formatInt(Number(id)), mono: false }
  }
  if (kind === 'epoch') return { node: t`Epoch ${id}`, mono: false }
  if (kind === 'name') return { node: nameParts(id), mono: false }
  const short = shortHash(id)
  if (short) {
    return { node: <ShortText short={short} />, mono: true }
  }
  return { node: id, mono: MONO_KINDS.has(kind) }
}

function Glyph({
  kind,
  id,
  size,
  identicon,
}: {
  kind: EntityKind
  id: string
  size: number
  identicon: boolean
}) {
  const meta = KIND_META[kind]
  if (kind === 'identity' && identicon) return <Identicon id={id} size={size} />
  if (kind === 'masternode' || kind === 'evonode') {
    return <Nodeprint id={id} evonode={kind === 'evonode'} size={size} />
  }
  return <LayerGlyph layer={meta.layer} icon={meta.icon} />
}

export function EntityChip({
  kind,
  id,
  label,
  href,
  copy = true,
  hover = true,
  size = 'md',
  identicon = kind === 'identity',
}: EntityChipProps) {
  const meta = KIND_META[kind]
  const { node, mono } = chipLabel(kind, id, label)
  const registered = useHoverCard(kind)
  const Card = hover ? registered : undefined
  const glyphSize = size === 'sm' ? 16 : 20
  const chipClass = cx(
    'rx-chip',
    size === 'sm' && 'rx-chip--sm',
    (kind === 'masternode' || kind === 'evonode') && 'rx-chip--strong',
  )
  const inner = (
    <>
      <Glyph kind={kind} id={id} size={glyphSize} identicon={identicon} />
      <span className={mono ? 'rx-chip__text' : 'rx-chip__name'}>{node}</span>
    </>
  )
  const trigger = href ? (
    <a className={chipClass} href={href} data-layer={layerAttr(meta.layer)}>
      {inner}
    </a>
  ) : (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- keyboard users open the hover card by focusing the chip
    <span className={chipClass} data-layer={layerAttr(meta.layer)} tabIndex={Card ? 0 : undefined}>
      {inner}
    </span>
  )

  return (
    <span className="rx-chipwrap" data-entity={kind} data-id={id} data-size={size}>
      {Card ? (
        <HoverCard.Root openDelay={350} closeDelay={200}>
          <HoverCard.Trigger asChild>{trigger}</HoverCard.Trigger>
          <HoverCard.Portal>
            <HoverCard.Content
              className="rx-hc rx-hc--pop"
              data-layer={layerAttr(meta.layer)}
              sideOffset={8}
              collisionPadding={12}
              align="start"
            >
              {createElement(Card, { id })}
            </HoverCard.Content>
          </HoverCard.Portal>
        </HoverCard.Root>
      ) : (
        trigger
      )}
      {copy ? <Copy value={id} label={t`Copy ${labelOf(meta)} ID`} /> : null}
    </span>
  )
}
