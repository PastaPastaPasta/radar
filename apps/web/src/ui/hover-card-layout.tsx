import type { ReactNode } from 'react'
import type { SourceStamp } from '@/data/envelope'
import { layerAttr } from './cx'
import { SourceLine } from './states'
import type { Layer } from './types'

export interface HoverCardLayoutProps {
  layer: Layer
  glyph: ReactNode
  kind: ReactNode
  title: ReactNode
  /** The full identifier, shown small and mono. */
  id?: string
  rows: { label: ReactNode; value: ReactNode }[]
  source?: SourceStamp | SourceStamp[]
  href?: string
  openLabel?: string
}

/** The body every entity hover card uses: glyph, type line, title, id, a few facts, source and an open link. */
export function HoverCardLayout({
  layer,
  glyph,
  kind,
  title,
  id,
  rows,
  source,
  href,
  openLabel = 'Open',
}: HoverCardLayoutProps) {
  return (
    <div className="rx-hc__inner" data-layer={layerAttr(layer)}>
      <div className="rx-hc__head">
        {glyph}
        <div>
          <div className="rx-hc__kind">{kind}</div>
          <div className="rx-hc__title">{title}</div>
        </div>
      </div>
      {id ? <p className="rx-hc__id">{id}</p> : null}
      <dl className="dh-kv">
        {rows.map((r, i) => (
          <div key={i}>
            <dt>{r.label}</dt>
            <dd>{r.value}</dd>
          </div>
        ))}
      </dl>
      <div className="rx-hc__foot">
        {source ? <SourceLine stamp={source} compact /> : null}
        {href ? (
          <a className="rx-go" href={href}>
            {openLabel}
          </a>
        ) : null}
      </div>
    </div>
  )
}

export function HoverCardLoading() {
  return (
    <div className="rx-hc__inner" aria-busy="true">
      <span className="rx-skels rx-skels--line" aria-hidden="true">
        <span className="rx-skel" style={{ width: '60%' }} />
        <span className="rx-skel" style={{ width: '90%' }} />
        <span className="rx-skel" style={{ width: '75%' }} />
      </span>
    </div>
  )
}
