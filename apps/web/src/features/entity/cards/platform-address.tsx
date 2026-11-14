import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { stampOf } from '@/data/envelope'
import { sdkBatchers } from '@/data/sdk/batchers'
import { decodePlatformAddress } from '@/lib/bech32'
import { formatInt } from '@/lib/format'
import { Amount, ErrorState, HoverCardLayout, LayerGlyph } from '@/ui'
import { entityHref } from '../hrefs'
import { useNetwork } from '../network'
import { CardLoading } from './frame'
import { shortId } from './parts'

export function PlatformAddressHoverCard({ id }: { id: string }) {
  const { t } = useLingui()
  const net = useNetwork()
  const valid = decodePlatformAddress(id) !== null
  const query = useQuery({
    ...sdkBatchers.platformAddressInfo.queryOptions(net, id),
    enabled: valid,
  })
  const common = {
    layer: 'platform',
    glyph: <LayerGlyph layer="platform" icon="addr" />,
    kind: t`Platform address`,
    href: entityHref('platform-address', id, net),
  } as const

  if (!valid) {
    return (
      <HoverCardLayout
        {...common}
        title={shortId(id)}
        rows={[{ label: t`Result`, value: t`This is not a Platform address.` }]}
      />
    )
  }
  if (query.isPending) return <CardLoading />
  if (query.isError) return <ErrorState error={query.error} source="sdk" compact />
  const info = query.data.data
  return (
    <div data-hover-card="platform-address">
      <HoverCardLayout
        {...common}
        title={shortId(id)}
        id={id}
        rows={
          info
            ? [
                { label: t`Balance`, value: <Amount value={info.balance} kind="credits" fiat /> },
                { label: t`Nonce`, value: formatInt(Number(info.nonce)) },
              ]
            : [{ label: t`Result`, value: t`This address holds nothing on Platform.` }]
        }
        source={stampOf(query.data)}
      />
    </div>
  )
}
