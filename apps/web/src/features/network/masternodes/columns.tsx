import { useLingui } from '@lingui/react/macro'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'
import type { MnRow } from '@/data/masternodes/rows'
import { Entity } from '@/features/entity'
import { formatInt, formatPercent } from '@/lib/format'
import { Amount, AmountDensity, Badge, Time } from '@/ui'

const DASH = '—'

const height = (h: number | null | undefined) => (h != null && h > 0 ? formatInt(h) : DASH)
const share = (v: number | null | undefined) => (v == null ? DASH : formatPercent(v, 1))

export interface MnColumnOptions {
  /** Some row carries Radar's crawl: its columns appear. */
  crawl: boolean
  /** Some row is an evonode: the Platform columns appear. */
  evo: boolean
}

export function statusLabel(row: MnRow): { tone: 'good' | 'warn' | 'bad' | 'none'; key: string } {
  if (row.status === 'pose-banned') return { tone: 'bad', key: 'banned' }
  const reachable = row.crawl?.reachable
  if (reachable === true) return { tone: 'good', key: 'answering' }
  if (reachable === false) return { tone: 'warn', key: 'silent' }
  return { tone: 'none', key: 'enabled' }
}

/** The list's columns. Ids are the `sort` names in the address; a column with a string accessor can filter by its cell. */
export function useMnColumns({ crawl, evo }: MnColumnOptions): ColumnDef<MnRow>[] {
  const { t } = useLingui()
  return useMemo(() => {
    const labels = {
      answering: t`Answering`,
      silent: t`No answer`,
      enabled: t`Enabled`,
      banned: t`PoSe-banned`,
    }
    const dapi: ColumnDef<MnRow>[] = [
      {
        id: 'protx',
        header: t`ProTx`,
        accessorFn: (r) => r.protx,
        cell: ({ row }) => (
          <span className="grid gap-1">
            <Entity
              kind={row.original.type === 'evo' ? 'evonode' : 'masternode'}
              id={row.original.protx}
            />
            {row.original.crawlDiffers ? (
              <span
                data-crawl-differs
                title={t`Radar’s crawl lists this masternode differently. DAPI’s list is shown.`}
              >
                <Badge tone="warning" size="sm">
                  {t`Radar differs`}
                </Badge>
              </span>
            ) : null}
          </span>
        ),
        meta: { phone: 'title', width: '10rem' },
      },
      {
        id: 'type',
        header: t`Type`,
        accessorFn: (r) => r.type,
        cell: ({ row }) => (row.original.type === 'evo' ? t`Evonode` : t`Masternode`),
        meta: { filterable: true, phone: 'hidden' },
      },
      {
        id: 'address',
        header: t`Address`,
        accessorFn: (r) => r.service ?? '',
        cell: ({ row }) => <span className="font-mono">{row.original.service ?? DASH}</span>,
      },
    ]
    const crawled: ColumnDef<MnRow>[] = crawl
      ? [
          {
            id: 'country',
            header: t`Country`,
            accessorFn: (r) => r.crawl?.country ?? '',
            cell: ({ row }) => {
              const c = row.original.crawl
              return c?.country ? (
                <span>
                  <span className="rx-cc">{c.country}</span>
                  {c.city ? ` ${c.city}` : ''}
                </span>
              ) : (
                DASH
              )
            },
            meta: { filterable: true, phone: 'secondary' },
          },
          {
            id: 'hosting',
            header: t`Hosting`,
            accessorFn: (r) => (r.crawl?.asn == null ? '' : String(r.crawl.asn)),
            cell: ({ row }) => row.original.crawl?.as_org ?? DASH,
            meta: { filterable: true, phone: 'hidden' },
          },
          {
            id: 'version',
            header: t`Version`,
            accessorFn: (r) => r.crawl?.version ?? '',
            cell: ({ row }) => row.original.crawl?.version ?? DASH,
            meta: { filterable: true, phone: 'secondary' },
          },
          {
            id: 'protocol',
            header: t`Protocol`,
            accessorFn: (r) => r.crawl?.protocol ?? 0,
            cell: ({ row }) => row.original.crawl?.protocol ?? DASH,
            meta: { numeric: true, phone: 'hidden' },
          },
        ]
      : []
    const status: ColumnDef<MnRow> = {
      id: 'status',
      header: t`Status`,
      accessorFn: (r) => r.status,
      cell: ({ row }) => {
        const s = statusLabel(row.original)
        return (
          <span className={s.tone === 'none' ? 'rx-st' : `rx-st rx-st--${s.tone}`}>
            {labels[s.key as keyof typeof labels]}
          </span>
        )
      },
      meta: { filterable: true, phone: 'primary' },
    }
    const history: ColumnDef<MnRow>[] = crawl
      ? [
          {
            id: 'uptime_7d',
            header: t`Uptime, 7 days`,
            accessorFn: (r) => r.crawl?.uptime_7d ?? 0,
            cell: ({ row }) => share(row.original.crawl?.uptime_7d),
            meta: { numeric: true, phone: 'hidden' },
          },
          {
            id: 'uptime_30d',
            header: t`Uptime, 30 days`,
            accessorFn: (r) => r.crawl?.uptime_30d ?? 0,
            cell: ({ row }) => share(row.original.crawl?.uptime_30d),
            meta: { numeric: true },
          },
          {
            id: 'last_paid',
            header: t`Last paid`,
            accessorFn: (r) => r.crawl?.last_paid_height ?? 0,
            cell: ({ row }) => height(row.original.crawl?.last_paid_height),
            meta: { numeric: true },
          },
          {
            id: 'registered',
            header: t`Registered`,
            accessorFn: (r) => r.crawl?.registered_height ?? 0,
            cell: ({ row }) => height(row.original.crawl?.registered_height),
            meta: { numeric: true, phone: 'hidden' },
          },
          {
            id: 'pose_penalty',
            header: t`PoSe penalty`,
            accessorFn: (r) => r.crawl?.pose_penalty ?? 0,
            cell: ({ row }) => row.original.crawl?.pose_penalty ?? DASH,
            meta: { numeric: true, phone: 'hidden' },
          },
        ]
      : []
    const platform: ColumnDef<MnRow>[] =
      crawl && evo
        ? [
            {
              id: 'platform_30d',
              header: t`Platform, 30 days`,
              accessorFn: (r) => Number(r.crawl?.platform?.d30 ?? 0),
              cell: ({ row }) => {
                const d30 = row.original.crawl?.platform?.d30
                return d30 == null ? (
                  DASH
                ) : (
                  <AmountDensity value="prose">
                    <Amount value={d30} kind="credits" compact />
                  </AmountDensity>
                )
              },
              meta: { numeric: true, phone: 'hidden' },
            },
            {
              id: 'next_block',
              header: t`Next block`,
              accessorFn: (r) => r.crawl?.platform?.next ?? 0,
              cell: ({ row }) => {
                const next = row.original.crawl?.platform?.next
                return next == null ? DASH : <Time ms={next} mode="relative" />
              },
              meta: { numeric: true, phone: 'hidden' },
            },
          ]
        : []
    return [...dapi, ...crawled, status, ...history, ...platform]
  }, [t, crawl, evo])
}
