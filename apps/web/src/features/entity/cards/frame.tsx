import { useLingui } from '@lingui/react/macro'
import { defaultGates } from '@/data/query'
import type { NetworkId } from '@/lib/network'
import { HoverCardLayout, Skeleton, type HoverCardLayoutProps } from '@/ui/base'

/** A hover card opened by a visitor may read DAPI only while the budget has room (§4.7). */
export function mayReadDapi(net: NetworkId): boolean {
  return defaultGates.dapi(net)
}

export function BusyCard(
  props: Pick<HoverCardLayoutProps, 'layer' | 'glyph' | 'kind' | 'title' | 'id' | 'href'>,
) {
  const { t } = useLingui()
  return (
    <HoverCardLayout
      {...props}
      rows={[{ label: t`Details`, value: t`DAPI is busy. Open this page to load them.` }]}
      openLabel={t`Open`}
    />
  )
}

export function CardLoading() {
  return (
    <div className="rx-hc__inner" aria-busy="true">
      <Skeleton shape="line" count={3} />
    </div>
  )
}
