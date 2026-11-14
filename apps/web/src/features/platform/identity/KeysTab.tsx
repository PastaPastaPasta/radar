import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'
import { stampOf } from '@/data/envelope'
import { sdkQueries } from '@/data/sdk/queries'
import type { IdentityKeyDetailDto } from '@/data/sdk/methods/p-id'
import { Entity, useNetwork } from '@/features/entity'
import { bytesToHex } from '@/lib/hex'
import { Badge, Card, DataTable, Empty, Hash, Time } from '@/ui'
import { loadState, type IdentityTabProps } from './common'
import { isHashKeyType, keyPurposeName, keyTypeName, securityLevelName } from './ids'

function KeyDataCell({ keyDto }: { keyDto: IdentityKeyDetailDto }) {
  const { t } = useLingui()
  const hex = bytesToHex(keyDto.data)
  return (
    <span className="flex flex-wrap items-center gap-2" data-key-data>
      <Hash value={hex} head={10} tail={6} />
      {isHashKeyType(keyDto.type) ? <Badge>{t`hash`}</Badge> : null}
    </span>
  )
}

function KeyBounds({ keyDto }: { keyDto: IdentityKeyDetailDto }) {
  const { t } = useLingui()
  const bounds = keyDto.contractBounds
  if (!bounds) return <span className="rx-dim">{t`None`}</span>
  return bounds.type === 'contractGroup' ? (
    <span>{t`Contract group ${bounds.id}`}</span>
  ) : (
    <span className="flex flex-wrap items-center gap-2">
      <Entity kind="contract" id={bounds.id} />
      {bounds.documentTypeName ? <Badge>{bounds.documentTypeName}</Badge> : null}
    </span>
  )
}

export function useKeyColumns(): ColumnDef<IdentityKeyDetailDto>[] {
  const { t } = useLingui()
  return useMemo<ColumnDef<IdentityKeyDetailDto>[]>(
    () => [
      { id: 'id', header: t`ID`, accessorFn: (k) => k.id, meta: { phone: 'title', numeric: true } },
      {
        id: 'purpose',
        header: t`Purpose`,
        accessorFn: (k) => keyPurposeName(k.purpose),
        meta: { phone: 'primary' },
      },
      {
        id: 'type',
        header: t`Type`,
        accessorFn: (k) => keyTypeName(k.type),
        meta: { phone: 'secondary' },
      },
      {
        id: 'level',
        header: t`Security level`,
        accessorFn: (k) => securityLevelName(k.securityLevel),
        meta: { phone: 'secondary' },
      },
      {
        id: 'data',
        header: t`Data`,
        cell: ({ row }) => <KeyDataCell keyDto={row.original} />,
        meta: { phone: 'secondary' },
      },
      {
        id: 'bounds',
        header: t`Contract bounds`,
        cell: ({ row }) => <KeyBounds keyDto={row.original} />,
        meta: { phone: 'secondary' },
      },
      {
        id: 'state',
        header: t`State`,
        cell: ({ row }) =>
          row.original.disabledAt !== undefined ? (
            <span className="flex flex-wrap items-center gap-1">
              <Badge tone="danger">{t`Disabled`}</Badge>
              <Time ms={row.original.disabledAt} mode="absolute" />
            </span>
          ) : row.original.readOnly ? (
            <Badge>{t`Read-only`}</Badge>
          ) : (
            <Badge tone="success">{t({ message: 'Active', context: 'identity key status' })}</Badge>
          ),
        meta: { phone: 'secondary' },
      },
    ],
    [t],
  )
}

export function KeysTab({ id }: IdentityTabProps) {
  const { t } = useLingui()
  const net = useNetwork()
  const keys = useQuery(sdkQueries['identities.getKeys'](net, { id }))
  const columns = useKeyColumns()
  return (
    <Card
      title={t`Public keys`}
      layer="platform"
      id="identity-keys"
      source={keys.data ? stampOf(keys.data) : undefined}
    >
      <DataTable
        caption={t`Public keys`}
        columns={columns}
        rows={keys.data?.data ?? []}
        getRowId={(k) => String(k.id)}
        state={loadState(keys)}
        error={keys.error}
        onRetry={() => void keys.refetch()}
        empty={<Empty kind="none-yet" title={t`This identity has no keys.`} />}
      />
    </Card>
  )
}
