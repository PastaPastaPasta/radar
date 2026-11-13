import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { stampOf } from '@/data/envelope'
import { sdkQueries } from '@/data/sdk/queries'
import { Badge, ErrorState, HoverCardLayout, LayerGlyph } from '@/ui'
import { entityHref } from '../hrefs'
import { useNetwork } from '../network'
import { CardLoading, OwnerChip } from './frame'

const withTld = (label: string) => (label.includes('.') ? label : `${label}.dash`)

export function NameHoverCard({ id }: { id: string }) {
  const { t } = useLingui()
  const net = useNetwork()
  const name = withTld(id)
  const query = useQuery(sdkQueries['dpns.getUsernameByName'](net, { name }))
  const common = {
    layer: 'platform',
    glyph: <LayerGlyph layer="platform" icon="name" />,
    kind: t`Username`,
    href: entityHref('name', id, net),
  } as const

  if (query.isPending) return <CardLoading />
  if (query.isError) return <ErrorState error={query.error} source="sdk" compact />
  const owner = query.data.data
  return (
    <div data-hover-card="name">
      <HoverCardLayout
        {...common}
        title={name}
        rows={
          owner
            ? [
                {
                  label: t`Status`,
                  value: (
                    <Badge tone="success" size="sm">
                      {t`Registered`}
                    </Badge>
                  ),
                },
                { label: t`Owner`, value: <OwnerChip id={owner.identityId} /> },
              ]
            : [
                {
                  label: t`Status`,
                  value: t`Not registered. It may be free or still contested.`,
                },
              ]
        }
        source={stampOf(query.data)}
      />
    </div>
  )
}
