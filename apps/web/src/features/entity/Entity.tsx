import { useSyncExternalStore } from 'react'
import { labelsVersion, subscribeLabels, wellKnownLabel } from '@/lib/well-known'
import { EntityChip, type EntityChipProps } from '@/ui'
import { entityHref, type EntitySearch } from './hrefs'
import { useNetwork, useSourceModeLink } from './network'

export type EntityProps = Omit<EntityChipProps, 'href'> & {
  href?: false
  /** Extra query parameters on the link, e.g. a contest outside DPNS names its contract, type and index. */
  search?: EntitySearch
}

/** A chip for an entity; without a `label`, a well-known contract, token or identity (or one the user labelled) is named. */
export function Entity({ kind, id, href, search, label, ...rest }: EntityProps) {
  const net = useNetwork()
  useSourceModeLink()
  useSyncExternalStore(subscribeLabels, labelsVersion, labelsVersion)
  return (
    <EntityChip
      kind={kind}
      id={id}
      label={label ?? wellKnownLabel(net, kind, id)}
      href={href ?? entityHref(kind, id, net, search)}
      {...rest}
    />
  )
}
