import type { ComponentType } from 'react'
import { Amount } from '../amount'
import { Identicon, LayerTile, Nodeprint } from '../art'
import { HoverCardLayout } from '../hover-card-layout'
import { KIND_META, labelOf } from '../kinds'
import type { EntityKind } from '../types'
import { STAMPS } from './samples'

function generic(kind: EntityKind): ComponentType<{ id: string }> {
  const meta = KIND_META[kind]
  return function KitCard({ id }) {
    const glyph =
      kind === 'identity' ? (
        <Identicon id={id} size={36} />
      ) : kind === 'masternode' || kind === 'evonode' ? (
        <Nodeprint id={id} evonode={kind === 'evonode'} size={36} />
      ) : (
        <LayerTile layer={meta.layer} icon={meta.icon} size={36} />
      )
    return (
      <HoverCardLayout
        layer={meta.layer}
        glyph={glyph}
        kind={labelOf(meta)}
        title={kind === 'block' ? 'Block 2,569,992' : labelOf(meta)}
        id={id}
        rows={[
          {
            label: 'Status',
            value: <span className="rx-st rx-st--good">Answering · enabled</span>,
          },
          { label: 'Balance', value: <Amount value={1_013_331_591_984n} kind="credits" /> },
          { label: 'Last seen', value: '2 min ago' },
        ]}
        source={kind === 'identity' ? STAMPS.proof : STAMPS.dapi}
        href="#"
        openLabel={`Open ${labelOf(meta).toLowerCase()}`}
      />
    )
  }
}

export const KIT_HOVER_CARDS = Object.fromEntries(
  (Object.keys(KIND_META) as EntityKind[]).map((kind) => [kind, generic(kind)]),
) as Record<EntityKind, ComponentType<{ id: string }>>
