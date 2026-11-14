import { useLingui } from '@lingui/react/macro'
import type { UseQueryResult } from '@tanstack/react-query'
import type { Sourced } from '@/data/envelope'
import type { PeDataContract } from '@/data/pe/schemas'
import { formatInt } from '@/lib/format'
import { isDevnet } from '@/lib/network'
import { Card, KeyValue, Time, Unavailable } from '@/ui'
import type { ContractContext } from './contract-context'
import { usePeEnabled } from './contract-data'
import { TypesList } from './TypesList'

export function OverviewTab({
  ctx,
  pe,
}: {
  ctx: ContractContext
  pe: UseQueryResult<Sourced<PeDataContract | null>>
}) {
  const { t } = useLingui()
  const record = pe.data?.data ?? null
  const peUnavailable = !usePeEnabled(ctx.net) && !isDevnet(ctx.net)
  return (
    <div className="grid gap-4">
      <Card title={t`Document types`} layer="platform" source={ctx.stamp} id="types">
        <TypesList id={ctx.id} contract={ctx.contract} expanded={false} />
      </Card>
      {peUnavailable ? (
        <Card title={t`Activity`} layer="platform" id="activity">
          <Unavailable source="pe" title={t`Contract activity needs Platform Explorer`} />
        </Card>
      ) : null}
      {record ? (
        <Card title={t`Activity`} layer="platform" source={pe.data} id="activity">
          <KeyValue
            columns={2}
            items={[
              ...(record.timestamp
                ? [{ label: t`Registered`, value: <Time ms={record.timestamp} mode="both" /> }]
                : []),
              ...(record.documentsCount != null
                ? [{ label: t`Documents`, value: formatInt(record.documentsCount) }]
                : []),
              ...(record.tokensCount != null
                ? [{ label: t`Tokens`, value: formatInt(record.tokensCount) }]
                : []),
              ...(record.identitiesInteracted != null
                ? [
                    {
                      label: t`Identities interacted`,
                      value: formatInt(record.identitiesInteracted),
                    },
                  ]
                : []),
            ]}
          />
          {record.description ? (
            <p className="mt-3 text-ink-2" translate="no">
              {record.description}
            </p>
          ) : null}
        </Card>
      ) : null}
    </div>
  )
}
