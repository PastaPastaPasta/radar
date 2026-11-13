import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { mnRowsQuery } from '@/data/masternodes/rows'
import { formatInt } from '@/lib/format'
import type { SourceStamp } from '@/data/envelope'
import { Badge, ErrorState, HoverCardLayout, LayerGlyph } from '@/ui'
import { entityHref } from '../hrefs'
import { useNetwork } from '../network'
import { BusyCard, CardLoading, mayReadDapi, shortId } from './frame'

export function MasternodeHoverCard({ id }: { id: string }) {
  const { t } = useLingui()
  const net = useNetwork()
  const allowed = mayReadDapi(net)
  const protx = id.toLowerCase()
  const query = useQuery({ ...mnRowsQuery(net), enabled: allowed })
  const row = query.data?.data.rows.find((r) => r.protx === protx)
  const kind = row?.type === 'evo' ? 'evonode' : 'masternode'
  const common = {
    layer: 'network',
    glyph: <LayerGlyph layer="network" icon="node" />,
    kind: kind === 'evonode' ? t`Evonode` : t`Masternode`,
    href: entityHref(kind, protx, net),
  } as const

  if (!query.data && !allowed) return <BusyCard {...common} title={shortId(protx)} />
  if (query.isPending) return <CardLoading />
  if (query.isError) return <ErrorState error={query.error} source="dapi" compact />
  if (!row) {
    return (
      <HoverCardLayout
        {...common}
        title={shortId(protx)}
        rows={[{ label: t`Result`, value: t`Not in this network's masternode list.` }]}
      />
    )
  }
  const crawl = row.crawl
  const stamps = [row.dapi, row.radar].filter((s): s is SourceStamp => s !== null)
  return (
    <div data-hover-card={kind}>
      <HoverCardLayout
        {...common}
        title={shortId(protx)}
        id={protx}
        rows={[
          {
            label: t`Status`,
            value: (
              <Badge tone={row.status === 'enabled' ? 'success' : 'danger'} size="sm">
                {row.status === 'enabled' ? t`Enabled` : t`PoSe-banned`}
              </Badge>
            ),
          },
          ...(crawl?.version ? [{ label: t`Version`, value: crawl.version }] : []),
          ...(crawl?.last_paid_height
            ? [{ label: t`Last paid`, value: t`Block ${formatInt(crawl.last_paid_height)}` }]
            : []),
          ...(row.service ? [{ label: t`Address`, value: row.service }] : []),
        ]}
        source={stamps}
      />
    </div>
  )
}
