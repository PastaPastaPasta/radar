import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { mapSourced, stampOf } from '@/data/envelope'
import { useIndexHealth } from '@/data/index-health'
import { hyQueries } from '@/data/hyphen/queries'
import { adaptAddress } from '@/data/insight/adapt'
import { insQueries } from '@/data/insight/queries'
import { formatInt } from '@/lib/format'
import { Amount, ErrorState, HoverCardLayout, LayerGlyph, Time } from '@/ui'
import { entityHref } from '../hrefs'
import { CardLoading } from './frame'
import { useNetwork } from '../network'

export function AddressHoverCard({ id }: { id: string }) {
  const { t } = useLingui()
  const net = useNetwork()
  const index = useIndexHealth(net)
  const insight = index.readFrom === 'insight'
  const hy = useQuery({ ...hyQueries.address(net, id), enabled: !insight && !index.pending })
  const ins = useQuery({
    ...insQueries.address(net, id),
    select: (s) => mapSourced(s, adaptAddress),
    enabled: insight,
  })
  const query = insight ? ins : hy
  const indexName = insight ? t`Insight` : t`Hyphen`
  const common = {
    layer: 'core',
    glyph: <LayerGlyph layer="core" icon="addr" />,
    kind: t`Core address`,
    href: entityHref('address', id, net),
  } as const
  const short = `${id.slice(0, 8)}…${id.slice(-6)}`

  if (query.isPending || index.pending) return <CardLoading />
  if (query.isError)
    return <ErrorState error={query.error} source={insight ? 'insight' : 'hyphen'} compact />
  const address = query.data.data
  if (!address) {
    return (
      <HoverCardLayout
        {...common}
        title={short}
        id={id}
        rows={[
          { label: t`Result`, value: t`${indexName} has not seen this address on this network.` },
        ]}
        source={stampOf(query.data)}
      />
    )
  }
  return (
    <div data-hover-card="address">
      <HoverCardLayout
        {...common}
        title={short}
        id={id}
        rows={[
          { label: t`Balance`, value: <Amount value={address.balance} kind="duffs" fiat /> },
          { label: t`Received`, value: <Amount value={address.totalReceived} kind="duffs" /> },
          { label: t`Transactions`, value: formatInt(address.txCount) },
          ...(address.lastSeen
            ? [{ label: t`Last seen`, value: <Time ms={address.lastSeen} mode="both" /> }]
            : []),
        ]}
        source={stampOf(query.data)}
      />
    </div>
  )
}
