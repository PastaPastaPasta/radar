import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { coreQueries } from '@/data/core/queries'
import { stampOf } from '@/data/envelope'
import { formatInt } from '@/lib/format'
import type { NetworkId } from '@/lib/network'
import { Card, Stat } from '@/ui'

/** What DAPI answers without Radar: the Core tip. Reading version bits from DAPI's headers would be possible; it is not done. */
export function CoreTipCard({ net }: { net: NetworkId }) {
  const { t } = useLingui()
  const tip = useQuery(coreQueries.tip(net))
  return (
    <Card
      title={t`Core tip`}
      id="tip"
      layer="network"
      source={tip.data ? stampOf(tip.data) : undefined}
      state={tip.data ? 'ready' : tip.isError ? 'error' : 'loading'}
      error={tip.error}
      onRetry={() => void tip.refetch()}
    >
      <Stat label={t`Core height`} value={tip.data ? formatInt(tip.data.data.height) : '—'} />
    </Card>
  )
}
