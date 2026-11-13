import { plural } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { stampOf } from '@/data/envelope'
import { peQueries } from '@/data/pe/queries'
import { sdkBatchers } from '@/data/sdk/batchers'
import { isPlatformId } from '@/lib/base58'
import { wellKnownContracts, wellKnownLabel } from '@/lib/well-known'
import { ErrorState, HoverCardLayout, LayerGlyph } from '@/ui'
import { entityHref } from '../hrefs'
import { useNetwork } from '../network'
import { CardLoading, OwnerChip, shortId, usePeOn } from './frame'

export function ContractHoverCard({ id }: { id: string }) {
  const { t } = useLingui()
  const net = useNetwork()
  const valid = isPlatformId(id)
  const meta = useQuery({ ...sdkBatchers.contractMeta.queryOptions(net, id), enabled: valid })
  const peOn = usePeOn(net)
  const pe = useQuery({ ...peQueries.dataContract(net, id), enabled: valid && peOn })
  const known = wellKnownContracts(net).find((c) => c.id === id)
  const common = {
    layer: 'platform',
    glyph: <LayerGlyph layer="platform" icon="contract" />,
    kind: t`Data contract`,
    href: entityHref('contract', id, net),
  } as const
  const title = wellKnownLabel(net, 'contract', id) ?? pe.data?.data?.name ?? shortId(id)

  if (!valid) {
    return (
      <HoverCardLayout
        {...common}
        title={shortId(id)}
        rows={[{ label: t`Result`, value: t`This is not a contract ID.` }]}
      />
    )
  }
  if (meta.isPending) return <CardLoading />
  if (meta.isError) return <ErrorState error={meta.error} source="sdk" compact />
  const contract = meta.data.data
  if (!contract) {
    return (
      <HoverCardLayout
        {...common}
        title={title}
        rows={[{ label: t`Result`, value: t`No contract with this ID on this network.` }]}
        source={stampOf(meta.data)}
      />
    )
  }
  const types = Object.keys(contract.documentSchemas).length
  return (
    <div data-hover-card="contract">
      <HoverCardLayout
        {...common}
        title={title}
        id={id}
        rows={[
          { label: t`Owner`, value: <OwnerChip id={contract.ownerId} /> },
          {
            label: t`Document types`,
            value: plural(types, { one: '# type', other: '# types' }),
          },
          { label: t`Version`, value: String(contract.version) },
          ...(known ? [{ label: t`About`, value: known.description }] : []),
        ]}
        source={stampOf(meta.data)}
      />
    </div>
  )
}
