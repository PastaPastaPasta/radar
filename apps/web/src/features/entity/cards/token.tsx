import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { stampOf } from '@/data/envelope'
import { peQueries } from '@/data/pe/queries'
import { sdkBatchers } from '@/data/sdk/batchers'
import { sdkQueries } from '@/data/sdk/queries'
import { isPlatformId } from '@/lib/base58'
import { wellKnownTokens } from '@/lib/well-known'
import { Amount, Badge, ErrorState, HoverCardLayout, LayerGlyph } from '@/ui'
import { entityHref } from '../hrefs'
import { useNetwork } from '../network'
import { CardLoading, shortId, usePeOn } from './frame'

export function TokenHoverCard({ id }: { id: string }) {
  const { t } = useLingui()
  const net = useNetwork()
  const valid = isPlatformId(id)
  const supply = useQuery({
    ...sdkQueries['tokens.totalSupply'](net, { tokenId: id }),
    enabled: valid,
  })
  const status = useQuery({ ...sdkBatchers.tokenStatus.queryOptions(net, id), enabled: valid })
  const peOn = usePeOn(net)
  const pe = useQuery({ ...peQueries.token(net, id), enabled: valid && peOn })
  const known = wellKnownTokens(net).find((k) => k.id === id)
  const localized = pe.data?.data?.localizations?.en
  const name = known?.name ?? localized?.singularForm ?? undefined
  const decimals = known?.decimals ?? pe.data?.data?.decimals ?? undefined
  const common = {
    layer: 'platform',
    glyph: <LayerGlyph layer="platform" icon="token" />,
    kind: t`Token`,
    href: entityHref('token', id, net),
  } as const
  const title = name ?? shortId(id)

  if (!valid) {
    return (
      <HoverCardLayout
        {...common}
        title={shortId(id)}
        rows={[{ label: t`Result`, value: t`This is not a token ID.` }]}
      />
    )
  }
  if (supply.isPending) return <CardLoading />
  if (supply.isError) return <ErrorState error={supply.error} source="sdk" compact />
  const total = supply.data.data
  if (total === null) {
    return (
      <HoverCardLayout
        {...common}
        title={title}
        rows={[{ label: t`Result`, value: t`No token with this ID on this network.` }]}
        source={stampOf(supply.data)}
      />
    )
  }
  const paused = status.data?.data?.paused === true
  return (
    <div data-hover-card="token">
      <HoverCardLayout
        {...common}
        title={title}
        id={id}
        rows={[
          {
            label: t`Supply`,
            value:
              decimals === undefined ? (
                t`${total.toLocaleString('en-US')} base units`
              ) : (
                <Amount
                  value={total}
                  kind={{ token: { decimals, ...(known ? { symbol: known.symbol } : {}) } }}
                />
              ),
          },
          {
            label: t`Status`,
            value: status.isPending ? (
              '…'
            ) : status.isError ? (
              t`Not available`
            ) : (
              <Badge tone={paused ? 'warning' : 'success'} size="sm">
                {paused ? t`Paused` : t`Active`}
              </Badge>
            ),
          },
        ]}
        source={status.data ? [stampOf(supply.data), stampOf(status.data)] : stampOf(supply.data)}
      />
    </div>
  )
}
