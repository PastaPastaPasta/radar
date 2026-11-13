import { plural } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { instantLockView } from '@/data/core/lock-state'
import { coreQueries } from '@/data/core/queries'
import { stampOf } from '@/data/envelope'
import { formatInt } from '@/lib/format'
import {
  Amount,
  Badge,
  ChainLockBadge,
  ErrorState,
  HoverCardLayout,
  InstantSendBadge,
  LayerGlyph,
  TypeBadge,
} from '@/ui'
import { entityHref } from '../hrefs'
import { useNetwork } from '../network'
import { BusyCard, CardLoading, mayReadDapi } from './frame'

export function TxHoverCard({ id }: { id: string }) {
  const { t } = useLingui()
  const net = useNetwork()
  const allowed = mayReadDapi(net)
  const query = useQuery({ ...coreQueries.tx(net, id, { priority: 'prefetch' }), enabled: allowed })
  const common = {
    layer: 'core',
    glyph: <LayerGlyph layer="core" icon="tx" />,
    kind: t`Core transaction`,
    href: entityHref('tx', id, net),
  } as const
  const short = `${id.slice(0, 8)}…${id.slice(-6)}`

  if (!allowed) return <BusyCard {...common} title={short} />
  if (query.isPending) return <CardLoading />
  if (query.isError) return <ErrorState error={query.error} source="dapi" compact />
  const tx = query.data.data
  if (!tx) {
    return (
      <HoverCardLayout
        {...common}
        title={short}
        rows={[{ label: t`Result`, value: t`No transaction with this ID on this network.` }]}
      />
    )
  }
  const total = tx.outputs.reduce((sum, o) => sum + o.value, 0n)
  const confirmations = tx.confirmations ?? 0
  return (
    <div data-hover-card="tx">
      <HoverCardLayout
        {...common}
        title={short}
        id={tx.txid}
        rows={[
          { label: t`Type`, value: <TypeBadge type={tx.type} /> },
          {
            label: t`Status`,
            value:
              tx.height === undefined ? (
                <Badge tone="warning" size="sm">
                  {t`In the mempool`}
                </Badge>
              ) : (
                <span className="inline-flex flex-wrap items-center gap-1">
                  {t`In block ${formatInt(tx.height)}`}
                  {tx.isChainLocked || tx.chainLockClaim ? (
                    <ChainLockBadge
                      locked={tx.isChainLocked === true}
                      claim={tx.chainLockClaim}
                      size="sm"
                    />
                  ) : tx.isInstantLocked ? (
                    <InstantSendBadge
                      claim={tx.instantLockClaim}
                      sources={instantLockView(tx).sources}
                      size="sm"
                    />
                  ) : (
                    <span>{confirmationsText(confirmations)}</span>
                  )}
                </span>
              ),
          },
          { label: t`Moved`, value: <Amount value={total} kind="duffs" fiat /> },
          {
            label: t`Inputs and outputs`,
            value: `${formatInt(tx.inputs.length)} → ${formatInt(tx.outputs.length)}`,
          },
        ]}
        source={stampOf(query.data)}
      />
    </div>
  )
}

const confirmationsText = (count: number) =>
  plural(count, { one: '# confirmation', other: '# confirmations' })
