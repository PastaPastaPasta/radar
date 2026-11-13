import { useSyncExternalStore } from 'react'
import { labelsVersion, subscribeLabels, wellKnownLabel } from '@/lib/well-known'
import { EntityChip, useMediaQuery, type EntityChipProps } from '@/ui'
import { entityHref, type EntitySearch } from './hrefs'
import { LongPressCard } from './LongPressCard'
import { useNetwork, useSourceModeLink } from './network'

/** A screen with no hover and a finger for a pointer: its chips open their card by a long press. */
const TOUCH_ONLY = '(hover: none) and (pointer: coarse)'

export type EntityProps = Omit<EntityChipProps, 'href'> & {
  href?: false
  /** Extra query parameters on the link, e.g. a contest outside DPNS names its contract, type and index. */
  search?: EntitySearch
}

/** A chip for an entity; without a `label`, a well-known contract, token or identity (or one the user labelled) is named. */
export function Entity({ kind, id, href, search, label, hover = true, ...rest }: EntityProps) {
  const net = useNetwork()
  useSourceModeLink()
  useSyncExternalStore(subscribeLabels, labelsVersion, labelsVersion)
  const touch = useMediaQuery(TOUCH_ONLY)
  const chip = (
    <EntityChip
      kind={kind}
      id={id}
      label={label ?? wellKnownLabel(net, kind, id)}
      href={href ?? entityHref(kind, id, net, search)}
      hover={hover && !touch}
      {...rest}
    />
  )
  return hover && touch ? (
    <LongPressCard kind={kind} id={id}>
      {chip}
    </LongPressCard>
  ) : (
    chip
  )
}
