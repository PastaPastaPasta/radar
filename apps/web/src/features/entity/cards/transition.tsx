import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { stampOf } from '@/data/envelope'
import { peQueries } from '@/data/pe/queries'
import { formatInt } from '@/lib/format'
import { Badge, ErrorState, HoverCardLayout, LayerGlyph, Time, TypeBadge } from '@/ui'
import { entityHref } from '../hrefs'
import { useNetwork } from '../network'
import { humanizeType, transitionBadgeType } from '../platform/transition-type'
import { CardLoading, IndexerNote, OwnerChip, shortId, usePeOn } from './frame'

export function TransitionHoverCard({ id }: { id: string }) {
  const { t } = useLingui()
  const net = useNetwork()
  const peOn = usePeOn(net)
  const query = useQuery({ ...peQueries.transaction(net, id), enabled: peOn })
  const common = {
    layer: 'platform',
    glyph: <LayerGlyph layer="platform" icon="doc" />,
    kind: t`State transition`,
    href: entityHref('transition', id, net),
  } as const

  if (!peOn) {
    return (
      <div data-hover-card="transition" data-unavailable="indexer">
        <HoverCardLayout
          {...common}
          title={shortId(id)}
          rows={[{ label: t`Details`, value: <IndexerNote net={net} /> }]}
        />
      </div>
    )
  }
  if (query.isPending) return <CardLoading />
  if (query.isError) return <ErrorState error={query.error} source="pe" compact />
  const tx = query.data.data
  if (!tx) {
    return (
      <HoverCardLayout
        {...common}
        title={shortId(id)}
        rows={[{ label: t`Result`, value: t`No state transition with this hash on this network.` }]}
        source={stampOf(query.data)}
      />
    )
  }
  const type = transitionBadgeType(tx.type, tx.batchType)
  const success = tx.status.toUpperCase() === 'SUCCESS'
  const owner = typeof tx.owner === 'string' ? tx.owner : tx.owner?.identifier
  return (
    <div data-hover-card="transition">
      <HoverCardLayout
        {...common}
        title={shortId(id)}
        id={tx.hash}
        rows={[
          {
            label: t`Type`,
            value: type ? (
              <TypeBadge type={type} />
            ) : (
              <Badge size="sm">{humanizeType(tx.type)}</Badge>
            ),
          },
          {
            label: t`Status`,
            value: (
              <Badge tone={success ? 'success' : 'danger'} size="sm">
                {success ? t`Success` : t`Failed`}
              </Badge>
            ),
          },
          ...(owner ? [{ label: t`Owner`, value: <OwnerChip id={owner} /> }] : []),
          ...(tx.blockHeight == null
            ? []
            : [{ label: t`Block`, value: formatInt(tx.blockHeight) }]),
          { label: t`Time`, value: <Time ms={tx.timestamp} mode="both" /> },
        ]}
        source={stampOf(query.data)}
      />
    </div>
  )
}
