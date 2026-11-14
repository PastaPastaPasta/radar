import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { sdkBatchers } from '@/data/sdk/batchers'
import { stampOf } from '@/data/envelope'
import { isPlatformId } from '@/lib/base58'
import { wellKnownIdentities } from '@/lib/well-known'
import { Amount, ErrorState, HoverCardLayout, Identicon, LayerGlyph } from '@/ui'
import { entityHref } from '../hrefs'
import { useNetwork } from '../network'
import { CardLoading } from './frame'
import { shortId } from './parts'

export function IdentityHoverCard({ id }: { id: string }) {
  const { t } = useLingui()
  const net = useNetwork()
  const valid = isPlatformId(id)
  const balance = useQuery({ ...sdkBatchers.identityBalance.queryOptions(net, id), enabled: valid })
  const name = useQuery({ ...sdkBatchers.dpnsName.queryOptions(net, id), enabled: valid })
  const known = wellKnownIdentities(net).find((i) => i.id === id)
  const common = {
    layer: 'platform',
    glyph: <LayerGlyph layer="platform" icon="id" />,
    kind: t`Identity`,
    href: entityHref('identity', id, net),
  } as const
  const title = name.data?.data ?? known?.name ?? shortId(id)

  if (!valid) {
    return (
      <HoverCardLayout
        {...common}
        title={shortId(id)}
        rows={[{ label: t`Result`, value: t`This is not an identity ID.` }]}
      />
    )
  }
  if (balance.isPending) return <CardLoading />
  if (balance.isError) return <ErrorState error={balance.error} source="sdk" compact />
  const credits = balance.data.data
  const stamps = [stampOf(balance.data), ...(name.data ? [stampOf(name.data)] : [])]
  return (
    <div data-hover-card="identity">
      <HoverCardLayout
        {...common}
        glyph={<Identicon id={id} size={28} />}
        title={title}
        id={id}
        rows={[
          credits === null
            ? { label: t`Result`, value: t`No identity with this ID on this network.` }
            : { label: t`Balance`, value: <Amount value={credits} kind="credits" fiat /> },
          ...(name.data?.data
            ? [{ label: t`Name`, value: name.data.data }]
            : name.isError
              ? [{ label: t`Name`, value: t`Could not read names.` }]
              : []),
          ...(known ? [{ label: t`About`, value: known.description }] : []),
        ]}
        source={stamps}
      />
    </div>
  )
}
