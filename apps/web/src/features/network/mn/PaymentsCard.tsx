import { useLingui } from '@lingui/react/macro'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'
import type { SourceStamp } from '@/data/envelope'
import type { RadarMasternodeDetail, RadarPayment } from '@/data/radar/schemas'
import { Entity } from '@/features/entity'
import { formatInt } from '@/lib/format'
import { Amount, Card, DataTable, Empty, Time } from '@/ui'

type Row = RadarPayment

export function PaymentsCard({ d, stamp }: { d: RadarMasternodeDetail; stamp: SourceStamp }) {
  const { t } = useLingui()
  const total = d.payments_summary?.count
  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      {
        id: 'block',
        header: t`Block`,
        cell: ({ row }) => (
          <Entity
            kind="block"
            id={String(row.original.height)}
            label={formatInt(row.original.height)}
          />
        ),
        meta: { phone: 'title' },
      },
      {
        id: 'paid',
        header: t`Paid`,
        cell: ({ row }) => <Time ms={row.original.time} mode="absolute" />,
        meta: { phone: 'secondary' },
      },
      {
        id: 'amount',
        header: t`Amount`,
        cell: ({ row }) => <Amount value={row.original.amount_duffs} kind="duffs" />,
        meta: { align: 'end', numeric: true, phone: 'primary' },
      },
    ],
    [t],
  )
  return (
    <Card
      title={t`Recent payments`}
      layer="core"
      source={stamp}
      id="payments"
      subtitle={
        total !== undefined && total > d.payments.length
          ? t`The latest ${formatInt(d.payments.length)} of ${formatInt(total)} payments Radar has indexed`
          : undefined
      }
      padding="flush"
    >
      <DataTable
        caption={t`Recent payments to this masternode`}
        columns={columns}
        rows={d.payments}
        getRowId={(r) => String(r.height)}
        state="ready"
        empty={<Empty kind="none-yet" title={t`No payments indexed for this masternode yet.`} />}
      />
      <p className="rx-card__foot">
        <span>
          {t`Paid to`} <Entity kind="address" id={d.payout_address} />
        </span>
      </p>
    </Card>
  )
}
