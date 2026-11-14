import { lazy, Suspense, useSyncExternalStore } from 'react'
import { labelsVersion, subscribeLabels, wellKnownLabel } from '@/lib/well-known'
import { EntityChip, useMediaQuery, type EntityChipProps } from '@/ui'
import { entityHref, type EntitySearch } from './hrefs'
import { useNetwork, useSourceModeLink } from './network'

/** Loaded on a touch screen only, so the popover code stays out of the entry chunk; `@__PURE__` lets an unused `Entity` be dropped from it. */
const LongPressCard = /* @__PURE__ */ lazy(() =>
  import('./LongPressCard').then((m) => ({ default: m.LongPressCard })),
)

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
  const card = hover && !(kind === 'contest' && search?.contract)
  const chip = (
    <EntityChip
      kind={kind}
      id={id}
      label={label ?? wellKnownLabel(net, kind, id)}
      href={href ?? entityHref(kind, id, net, search)}
      hover={card && !touch}
      {...rest}
    />
  )
  return card && touch ? (
    <Suspense fallback={chip}>
      <LongPressCard kind={kind} id={id}>
        {chip}
      </LongPressCard>
    </Suspense>
  ) : (
    chip
  )
}
