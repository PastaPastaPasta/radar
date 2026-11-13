import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { stampOf } from '@/data/envelope'
import { sdkQueries } from '@/data/sdk/queries'
import { isPlatformId } from '@/lib/base58'
import { ErrorState, HoverCardLayout, LayerGlyph, Time } from '@/ui'
import { entityHref } from '../hrefs'
import { useNetwork } from '../network'
import { CardLoading, OwnerChip, shortId } from './frame'

/** A document is addressed `contract/type/id`. */
function parts(id: string): { contract: string; type: string; doc: string } | undefined {
  const [contract, type, doc, ...rest] = id.split('/')
  if (!contract || !type || !doc || rest.length > 0) return undefined
  return { contract, type, doc }
}

export function DocumentHoverCard({ id }: { id: string }) {
  const { t } = useLingui()
  const net = useNetwork()
  const ref = parts(id)
  const valid = ref !== undefined && isPlatformId(ref.contract) && isPlatformId(ref.doc)
  const query = useQuery({
    ...sdkQueries['documents.get'](net, {
      contractId: ref?.contract ?? '',
      type: ref?.type ?? '',
      id: ref?.doc ?? '',
    }),
    enabled: valid,
  })
  const common = {
    layer: 'platform',
    glyph: <LayerGlyph layer="platform" icon="doc" />,
    kind: t`Document`,
    href: entityHref('document', id, net),
  } as const

  if (!valid) {
    return (
      <HoverCardLayout
        {...common}
        title={id}
        rows={[{ label: t`Result`, value: t`This is not a document address.` }]}
      />
    )
  }
  const title = `${ref.type} ${shortId(ref.doc)}`
  if (query.isPending) return <CardLoading />
  if (query.isError) return <ErrorState error={query.error} source="sdk" compact />
  const doc = query.data.data
  if (!doc) {
    return (
      <HoverCardLayout
        {...common}
        title={title}
        rows={[{ label: t`Result`, value: t`No document with this ID on this network.` }]}
        source={stampOf(query.data)}
      />
    )
  }
  return (
    <div data-hover-card="document">
      <HoverCardLayout
        {...common}
        title={title}
        id={doc.id}
        rows={[
          { label: t`Type`, value: doc.type },
          { label: t`Owner`, value: <OwnerChip id={doc.ownerId} /> },
          ...(doc.updatedAt !== null || doc.createdAt !== null
            ? [
                {
                  label: t`Updated`,
                  value: <Time ms={doc.updatedAt ?? doc.createdAt ?? 0} mode="both" />,
                },
              ]
            : []),
          ...(doc.revision !== null ? [{ label: t`Revision`, value: String(doc.revision) }] : []),
        ]}
        source={stampOf(query.data)}
      />
    </div>
  )
}
