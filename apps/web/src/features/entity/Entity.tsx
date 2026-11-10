import { EntityChip, type EntityChipProps } from '@/ui'
import { entityHref } from './hrefs'
import { useNetwork } from './network'

export type EntityProps = Omit<EntityChipProps, 'href'> & { href?: false }

export function Entity({ kind, id, href, ...rest }: EntityProps) {
  const net = useNetwork()
  return <EntityChip kind={kind} id={id} href={href ?? entityHref(kind, id, net)} {...rest} />
}
