import { useLingui } from '@lingui/react/macro'
import { useDecentralizedOnly } from '@/data/health'
import { defaultGates } from '@/data/query'
import { isDevnet, type NetworkId } from '@/lib/network'
import { HoverCardLayout, Skeleton, type HoverCardLayoutProps } from '@/ui/base'
import { Entity } from '../Entity'
import { useIdentityName } from '../platform/use-identity-name'

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

/** Platform Explorer is asked only on the networks it covers and while Decentralized only mode allows it. */
export function usePeOn(net: NetworkId): boolean {
  const off = useDecentralizedOnly()
  return !off && !isDevnet(net)
}

export const shortId = (id: string): string =>
  id.length > 16 ? `${id.slice(0, 8)}…${id.slice(-6)}` : id

/** An identity inside a card: named when the SDK knows its name, without a card of its own. */
export function OwnerChip({ id }: { id: string }) {
  const name = useIdentityName(id)
  return <Entity kind="identity" id={id} label={name} size="sm" copy={false} hover={false} />
}

/** What a card says in the row an indexer would have filled, when none may be asked. */
export function IndexerNote({ net }: { net: NetworkId }) {
  const { t } = useLingui()
  const off = useDecentralizedOnly()
  return off
    ? t`Needs an indexer: off in Decentralized only mode`
    : isDevnet(net)
      ? t`No indexer covers this network.`
      : null
}
