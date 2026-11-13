import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { stampOf } from '@/data/envelope'
import { heightLookup } from '@/data/pe/blocks-query'
import { peQueries } from '@/data/pe/queries'
import { formatInt } from '@/lib/format'
import { ErrorState, HoverCardLayout, LayerGlyph, Time } from '@/ui'
import { Entity } from '../Entity'
import { entityHref } from '../hrefs'
import { useNetwork } from '../network'
import { CardLoading, IndexerNote, usePeOn } from './frame'

const isHeight = (id: string) => /^\d+$/.test(id)

export function PlatformBlockHoverCard({ id }: { id: string }) {
  const { t } = useLingui()
  const net = useNetwork()
  const peOn = usePeOn(net)
  const byHeight = isHeight(id)
  const list = useQuery({
    ...peQueries.blocks(net, heightLookup(byHeight ? Number(id) : undefined)),
    enabled: peOn && byHeight,
  })
  const hash = byHeight ? list.data?.data.items[0]?.header.hash : id
  const full = useQuery({
    ...peQueries.block(net, hash ?? ''),
    enabled: peOn && hash !== undefined,
  })
  const common = {
    layer: 'platform',
    glyph: <LayerGlyph layer="platform" icon="plat" />,
    kind: t`Platform block`,
    href: entityHref('platform-block', id, net),
  } as const
  const title = byHeight ? t`Block ${formatInt(Number(id))}` : `${id.slice(0, 10)}…`

  if (!peOn) {
    return (
      <div data-hover-card="platform-block" data-unavailable="indexer">
        <HoverCardLayout
          {...common}
          title={title}
          rows={[{ label: t`Details`, value: <IndexerNote net={net} /> }]}
        />
      </div>
    )
  }
  const pending = byHeight
    ? list.isPending || (hash !== undefined && full.isPending)
    : full.isPending
  if (pending) return <CardLoading />
  const error = list.error ?? full.error
  if (error) return <ErrorState error={error} source="pe" compact />
  const block = full.data?.data
  if (!block) {
    return (
      <HoverCardLayout
        {...common}
        title={title}
        rows={[{ label: t`Result`, value: t`No Platform block with this ID on this network.` }]}
        source={full.data ? stampOf(full.data) : undefined}
      />
    )
  }
  return (
    <div data-hover-card="platform-block">
      <HoverCardLayout
        {...common}
        title={t`Block ${formatInt(block.header.height)}`}
        id={block.header.hash}
        rows={[
          { label: t`Time`, value: <Time ms={block.header.timestamp} mode="both" /> },
          { label: t`Transitions`, value: formatInt(block.txs.length) },
          {
            label: t`Proposer`,
            value: (
              <Entity
                kind="evonode"
                id={block.header.validator.toLowerCase()}
                size="sm"
                copy={false}
                hover={false}
              />
            ),
          },
        ]}
        source={stampOf(full.data!)}
      />
    </div>
  )
}
