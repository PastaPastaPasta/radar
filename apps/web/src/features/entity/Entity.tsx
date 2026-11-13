import { EntityChip, type EntityChipProps } from '@/ui'
import { entityHref, type EntitySearch } from './hrefs'
import { useNetwork, useSourceModeLink } from './network'

export type EntityProps = Omit<EntityChipProps, 'href'> & {
  href?: false
  /** Extra query parameters on the link, e.g. a contest outside DPNS names its contract, type and index. */
  search?: EntitySearch
}

export function Entity({ kind, id, href, search, ...rest }: EntityProps) {
  const net = useNetwork()
  useSourceModeLink()
  return (
    <EntityChip kind={kind} id={id} href={href ?? entityHref(kind, id, net, search)} {...rest} />
  )
}
