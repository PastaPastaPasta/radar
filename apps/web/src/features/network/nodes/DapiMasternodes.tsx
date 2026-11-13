import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { mnRowsQuery } from '@/data/masternodes/rows'
import type { NetworkId } from '@/lib/network'
import { formatInt } from '@/lib/format'
import { Card, Empty, Skeleton, Stat } from '@/ui'
import { CoreTipCard } from '../v24/CoreTipCard'
import { FigureGrid } from './parts'

/**
 * What DAPI answers without Radar's crawl: the Core tip and the masternode list's own counts. Until the DAPI list is
 * wired up (or while it fails) the card says so quietly instead of raising an error.
 */
export function DapiMasternodes({ net }: { net: NetworkId }) {
  const { t } = useLingui()
  const list = useQuery(mnRowsQuery(net))
  const rows = list.data?.data.rows ?? []
  const dapi = list.data?.data.dapi
  const count = (f: (r: (typeof rows)[number]) => boolean) => formatInt(rows.filter(f).length)
  return (
    <div className="grid gap-4" data-dapi-census>
      <CoreTipCard net={net} />
      <Card
        title={t`Masternode list from DAPI`}
        id="dapi-list"
        layer="network"
        source={dapi ?? undefined}
      >
        {list.isPending ? (
          <Skeleton shape="line" count={2} />
        ) : dapi ? (
          <FigureGrid columns={4}>
            <Stat label={t`Registered`} value={formatInt(rows.length)} />
            <Stat label={t`Valid`} value={count((r) => r.status === 'enabled')} />
            <Stat label={t`PoSe-banned`} value={count((r) => r.status === 'pose-banned')} />
            <Stat
              label={t`Regular · evonodes`}
              value={`${count((r) => r.type === 'regular')} · ${count((r) => r.type === 'evo')}`}
            />
          </FigureGrid>
        ) : (
          <Empty
            kind="none-yet"
            title={t`DAPI's masternode list isn't available right now.`}
            body={t`The node census, which needs Radar's crawl, is the part that is missing. The Core tip above comes from DAPI.`}
          />
        )}
      </Card>
    </div>
  )
}
