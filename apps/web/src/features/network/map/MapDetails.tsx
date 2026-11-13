import { useLingui } from '@lingui/react/macro'
import type { MnRow } from '@/data/masternodes/rows'
import { formatInt } from '@/lib/format'
import { Badge } from '@/ui'
import { mnCount } from './counts'
import { sortGroup } from './map-model'
import type { CityPick } from './MapView'
import { useWhere } from './NodeCard'

function Head({ title, onClose }: { title: string; onClose: () => void }) {
  const { t } = useLingui()
  return (
    <div className="rx-map-row">
      <h2 className="rx-map-h">{title}</h2>
      <button type="button" className="rx-map-link" onClick={onClose}>
        {t`Close`}
      </button>
    </div>
  )
}

/** The masternodes at one point, listed once a cluster cannot split any further. */
export function GroupList({
  rows,
  onOpen,
  onClose,
}: {
  rows: MnRow[]
  onOpen: (protx: string) => void
  onClose: () => void
}) {
  const { t } = useLingui()
  const where = useWhere()
  const places = new Set(rows.map((r) => where(r.crawl)))
  const first = rows[0]
  const only = first ? where(first.crawl) : ''
  const title =
    places.size === 1 ? only || t`Same location` : t`${formatInt(places.size)} places nearby`
  const reachable = rows.filter((r) => r.crawl?.reachable === true).length
  return (
    <section className="rx-map-group" data-map-group aria-live="polite">
      <Head title={title} onClose={onClose} />
      <p className="rx-map-sub">{t`${mnCount(rows.length)}, ${formatInt(reachable)} reachable.`}</p>
      <ul className="rx-map-list">
        {sortGroup(rows).map((r) => (
          <li key={r.protx}>
            <button
              type="button"
              className="rx-map-mnrow"
              onClick={() => {
                onOpen(r.protx)
              }}
            >
              <span
                className="rx-map-dot"
                data-reach={r.crawl?.reachable == null ? 'unchecked' : String(r.crawl.reachable)}
                title={
                  r.crawl?.reachable === true
                    ? t`Reachable`
                    : r.crawl?.reachable === false
                      ? t`Unreachable`
                      : t`Not checked`
                }
              />
              <span className="font-mono">{r.service ?? r.protx.slice(0, 10)}</span>
              {r.type === 'evo' ? <Badge tone="info" size="sm">{t`Evo`}</Badge> : null}
              {r.status === 'pose-banned' ? (
                <Badge tone="warning" size="sm">{t`PoSe-banned`}</Badge>
              ) : null}
              <span className="rx-map-muted">{r.crawl?.version ?? '—'}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** A city of the all-nodes layer, or a cluster of cities too close to tell apart. */
export function CityInfo({ pick, onClose }: { pick: CityPick; onClose: () => void }) {
  const { t } = useLingui()
  const where = useWhere()
  const { point, nodes, masternodes } = pick
  return (
    <section className="rx-map-group" data-map-city aria-live="polite">
      <Head title={(point ? where(point) : '') || t`This area`} onClose={onClose} />
      <p className="rx-map-sub">
        {t`${formatInt(nodes)} reachable nodes: ${formatInt(masternodes)} masternodes and ${formatInt(nodes - masternodes)} other full nodes.`}
      </p>
    </section>
  )
}
