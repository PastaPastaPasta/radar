import { useLingui } from '@lingui/react/macro'
import { useNavigate, useSearch } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { stampOf } from '@/data/envelope'
import { useDecentralizedOnly } from '@/data/health'
import { radarQueries } from '@/data/radar/queries'
import type { RadarChange } from '@/data/radar/schemas'
import { Entity, PageFrame, PageLink, useNetwork } from '@/features/entity'
import { formatInt } from '@/lib/format'
import { isDevnet } from '@/lib/network'
import './changes.css'
import { Badge, DataTable, Empty, SegFilter, Time, Unavailable } from '@/ui'
import {
  CHANGE_KINDS,
  FIELD_LABEL,
  KIND_LABEL,
  changeTone,
  matchesKind,
  valueText,
  type KindFilter,
} from './changes-model'

export function ChangesPage() {
  const { t } = useLingui()
  return (
    <PageFrame
      path="/changes"
      title={t`Changes`}
      eyebrow={t`Network`}
      layer="network"
      lede={t`The latest changes to masternode registrations, newest first: new and removed masternodes, PoSe bans and revivals, changed addresses and keys.`}
    >
      <ChangesList />
    </PageFrame>
  )
}

function ChangesList() {
  const { t, i18n } = useLingui()
  const net = useNetwork()
  const off = useDecentralizedOnly()
  const { kind } = useSearch({ from: '/changes' })
  const navigate = useNavigate()
  const available = !off && !isDevnet(net)
  const q = useQuery({ ...radarQueries.changes(net), enabled: available })
  const changes = q.data?.data.changes

  const rows = useMemo(
    () => (changes ?? []).filter((c) => matchesKind(c.field, kind)),
    [changes, kind],
  )
  const words = useMemo(
    () => ({
      enabled: t`Enabled`,
      banned: (height: string) => t`Banned at block ${formatInt(Number(height))}`,
    }),
    [t],
  )

  const columns = useMemo<ColumnDef<RadarChange>[]>(
    () => [
      {
        id: 'when',
        header: t`When`,
        accessorFn: (c) => c.ts,
        cell: ({ row }) => <Time ms={row.original.ts} mode="relative" live />,
        meta: { phone: 'secondary' },
      },
      {
        id: 'block',
        header: t`Block`,
        accessorFn: (c) => c.height,
        cell: ({ row }) => (
          <PageLink to={`/block/${row.original.height}`} className="font-mono">
            {formatInt(row.original.height)}
          </PageLink>
        ),
        meta: { numeric: true, phone: 'secondary' },
      },
      {
        id: 'masternode',
        header: t`Masternode`,
        accessorFn: (c) => c.protx,
        cell: ({ row }) => (
          <Entity
            kind={row.original.type === 'Evo' ? 'evonode' : 'masternode'}
            id={row.original.protx}
          />
        ),
        meta: { phone: 'title' },
      },
      {
        id: 'change',
        header: t`Change`,
        accessorFn: (c) => c.field,
        cell: ({ row }) => {
          const c = row.original
          const label = FIELD_LABEL[c.field] ? i18n._(FIELD_LABEL[c.field]!) : c.field
          const value = (v: unknown) => valueText(c.field, v, words)
          const text =
            c.field === 'registered' || c.field === 'returned'
              ? c.new
                ? t`${label} at ${value(c.new)}`
                : label
              : c.field === 'removed'
                ? c.old
                  ? t`${label} (was at ${value(c.old)})`
                  : label
                : `${label}: ${value(c.old)} → ${value(c.new)}`
          return (
            <span className="rx-chg" data-change-field={c.field}>
              <Badge tone={changeTone(c)}>{label}</Badge>
              {text === label ? null : <span className="rx-chg__text">{text}</span>}
            </span>
          )
        },
      },
    ],
    [t, i18n, words],
  )

  if (isDevnet(net)) {
    return (
      <Empty
        kind="unsupported-network"
        title={t`Radar doesn't crawl devnets.`}
        body={t`Masternode list changes come from Radar's crawl of mainnet and testnet.`}
      />
    )
  }
  if (off) {
    return <Unavailable title={t`Masternode list changes need Radar's crawl`} source="radar" />
  }

  const kinds: { id: KindFilter; label: string }[] = [
    { id: 'all', label: i18n._(KIND_LABEL.all) },
    ...CHANGE_KINDS.map((k) => ({ id: k, label: i18n._(KIND_LABEL[k]) })),
  ]

  return (
    <div className="grid min-w-0 gap-4">
      <SegFilter
        label={t`Kind of change`}
        value={kind}
        options={kinds}
        onChange={(id) => {
          void navigate({
            to: '/changes',
            replace: true,
            resetScroll: false,
            search: ((prev: Record<string, unknown>) => ({ ...prev, kind: id })) as never,
          })
        }}
      />
      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(c) => `${c.ts}-${c.protx}-${c.field}-${String(c.old)}-${String(c.new)}`}
        state={
          q.isPending ? 'loading' : q.isError ? 'error' : rows.length === 0 ? 'empty' : 'ready'
        }
        error={q.error}
        onRetry={() => void q.refetch()}
        caption={t`Latest masternode list changes`}
        phone="cards"
        source={q.data ? stampOf(q.data) : undefined}
        empty={
          <Empty
            kind="none-yet"
            title={
              (changes?.length ?? 0) > 0
                ? t`No changes of this kind lately.`
                : t`No changes recorded yet.`
            }
          />
        }
      />
    </div>
  )
}
