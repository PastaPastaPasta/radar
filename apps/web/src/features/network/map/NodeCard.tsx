import { useLingui } from '@lingui/react/macro'
import { Link } from '@tanstack/react-router'
import type { MnRow } from '@/data/masternodes/rows'
import { Entity } from '@/features/entity'
import { formatInt, formatPercent } from '@/lib/format'
import { Badge } from '@/ui'
import { placeName } from './map-model'

const DASH = '—'

export function countryName(code: string | null | undefined, locale: string): string | undefined {
  if (!code) return undefined
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code
  } catch {
    return code
  }
}

export function useWhere() {
  const { i18n } = useLingui()
  return (c: { city?: string | null; country?: string | null } | null | undefined): string => {
    const name = countryName(c?.country, i18n.locale)
    return placeName({ city: c?.city, country: name })
  }
}

/** One masternode's facts, in the map's popup on wide screens and in the sheet on phones. */
export function NodeCard({ row, tip }: { row: MnRow; tip: number | undefined }) {
  const { t } = useLingui()
  const where = useWhere()
  const c = row.crawl
  const paid = !c?.last_paid_height
    ? t`never`
    : tip
      ? t`${formatInt(Math.max(0, tip - c.last_paid_height))} blocks ago`
      : t`block ${formatInt(c.last_paid_height)}`
  const facts: [string, string][] = [
    [t`Address`, row.service ?? DASH],
    [t`Version`, c?.version ?? DASH],
    [t`Location`, where(c) || DASH],
    [t`Hosting`, c?.as_org ?? DASH],
    [t`Uptime, 7 days`, c?.uptime_7d != null ? formatPercent(c.uptime_7d, 1) : DASH],
    [t`Last paid`, paid],
  ]
  return (
    <div className="rx-map-card" data-map-card={row.protx}>
      <div className="rx-map-card__head">
        {c?.reachable === true ? (
          <Badge tone="success">{t`Reachable`}</Badge>
        ) : c?.reachable === false ? (
          <Badge tone="danger">{t`Unreachable`}</Badge>
        ) : (
          <Badge>{t`Not checked`}</Badge>
        )}
        {row.status === 'pose-banned' ? <Badge tone="warning">{t`PoSe-banned`}</Badge> : null}
        {row.type === 'evo' ? <Badge tone="info">{t`Evo`}</Badge> : null}
      </div>
      <Entity kind={row.type === 'evo' ? 'evonode' : 'masternode'} id={row.protx} />
      <dl className="rx-map-card__facts">
        {facts.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <Link
        to="/mn/$protx"
        params={{ protx: row.protx }}
        className="dh-btn dh-btn--sm"
        data-open-mn
      >
        {t`Open masternode`}
      </Link>
    </div>
  )
}
