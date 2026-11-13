import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { stampOf } from '@/data/envelope'
import { sdkQueries } from '@/data/sdk/queries'
import { formatInt } from '@/lib/format'
import { Badge, ErrorState, HoverCardLayout, LayerGlyph, Time } from '@/ui'
import { entityHref } from '../hrefs'
import { useNetwork } from '../network'
import { CardLoading } from './frame'

export function EpochHoverCard({ id }: { id: string }) {
  const { t } = useLingui()
  const net = useNetwork()
  const index = /^\d+$/.test(id) ? Number(id) : undefined
  const query = useQuery({
    ...sdkQueries['epoch.epochsInfo'](net, { startEpoch: index ?? 0, count: 2, ascending: true }),
    enabled: index !== undefined,
  })
  const common = {
    layer: 'platform',
    glyph: <LayerGlyph layer="platform" icon="epoch" />,
    kind: t`Epoch`,
    href: entityHref('epoch', id, net),
  } as const
  const title = t`Epoch ${id}`

  if (index === undefined) {
    return (
      <HoverCardLayout
        {...common}
        title={title}
        rows={[{ label: t`Result`, value: t`This is not an epoch number.` }]}
      />
    )
  }
  if (query.isPending) return <CardLoading />
  if (query.isError) return <ErrorState error={query.error} source="sdk" compact />
  const [epoch, next] = query.data.data.filter((e) => e.index >= index)
  if (epoch?.index !== index) {
    return (
      <HoverCardLayout
        {...common}
        title={title}
        rows={[{ label: t`Result`, value: t`No epoch with this number yet.` }]}
        source={stampOf(query.data)}
      />
    )
  }
  const ended = next?.index === index + 1 ? next : undefined
  return (
    <div data-hover-card="epoch">
      <HoverCardLayout
        {...common}
        title={title}
        rows={[
          { label: t`Started`, value: <Time ms={epoch.firstBlockTimeMs} mode="both" /> },
          {
            label: t`Ended`,
            value: ended ? (
              <Time ms={ended.firstBlockTimeMs} mode="both" />
            ) : (
              <Badge tone="info" size="sm">
                {t`In progress`}
              </Badge>
            ),
          },
          ...(ended
            ? [
                {
                  label: t`Blocks`,
                  value: formatInt(ended.firstBlockHeight - epoch.firstBlockHeight),
                },
              ]
            : [{ label: t`First block`, value: formatInt(epoch.firstBlockHeight) }]),
        ]}
        source={stampOf(query.data)}
      />
    </div>
  )
}
