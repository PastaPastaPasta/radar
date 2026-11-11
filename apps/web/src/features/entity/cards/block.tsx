import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { coreQueries } from '@/data/core/queries'
import { stampOf } from '@/data/envelope'
import { formatBytes, formatInt } from '@/lib/format'
import { Badge, ErrorState, HoverCardLayout, LayerGlyph, Time } from '@/ui'
import { entityHref, entityPath } from '../hrefs'
import { useNetwork } from '../network'
import { BusyCard, CardLoading, mayReadDapi } from './frame'

export function BlockHoverCard({ id }: { id: string }) {
  const { t } = useLingui()
  const net = useNetwork()
  const allowed = mayReadDapi(net)
  const ref = /^\d+$/.test(id) ? { height: Number(id) } : { hash: id }
  const query = useQuery({
    ...coreQueries.block(net, ref, { priority: 'prefetch' }),
    enabled: allowed,
  })
  const href = entityHref('block', id, net)
  const common = {
    layer: 'core',
    glyph: <LayerGlyph layer="core" icon="block" />,
    kind: t`Core block`,
    href,
  } as const

  if (!allowed) return <BusyCard {...common} title={labelOf(id)} />
  if (query.isPending) return <CardLoading />
  if (query.isError) return <ErrorState error={query.error} source="dapi" compact />
  const block = query.data.data
  if (!block) {
    return (
      <HoverCardLayout
        {...common}
        title={labelOf(id)}
        rows={[{ label: t`Result`, value: t`No block with this ID on this network.` }]}
      />
    )
  }
  return (
    <div data-hover-card="block" data-path={entityPath('block', id)}>
      <HoverCardLayout
        {...common}
        title={t`Block ${formatInt(block.height)}`}
        id={block.hash}
        rows={[
          { label: t`Time`, value: <Time ms={block.time} mode="both" /> },
          { label: t`Transactions`, value: formatInt(block.txs.length) },
          { label: t`Size`, value: formatBytes(block.size) },
          {
            label: t`Finality`,
            value: block.chainLocked ? (
              <Badge tone="success" size="sm">
                {t`ChainLocked`}
              </Badge>
            ) : (
              <Badge tone="warning" size="sm">
                {t`Not ChainLocked yet`}
              </Badge>
            ),
          },
        ]}
        source={stampOf(query.data)}
      />
    </div>
  )
}

function labelOf(id: string): string {
  return /^\d+$/.test(id) ? formatInt(Number(id)) : `${id.slice(0, 10)}…`
}
