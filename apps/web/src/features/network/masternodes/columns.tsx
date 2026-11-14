import { plural } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'
import type { MnRow } from '@/data/masternodes/rows'
import { Entity } from '@/features/entity'
import { formatInt, formatPercent } from '@/lib/format'
import { Badge } from '@/ui'

const DASH = '—'
/**
 * Mainnet's average block spacing since DIP3 (about 157.5 s, a little over the 150 s target, as blocks arrive a bit
 * slower than the target on average). A height that many spacings behind the tip is about that long ago. Other
 * networks have no figure measured from data Radar already holds, so they show block counts only.
 */
export const MAINNET_BLOCK_MS = 157_500
const HOUR = 3_600_000
const DAY = 24 * HOUR
const YEAR = 365.25 * DAY

const share = (v: number | null | undefined) => (v == null ? DASH : formatPercent(v, 1))

/** About how long ago `blocks` blocks were, in the reader's language: "~3 hours ago", "~2 days ago", "~7.7 years ago". */
export function blocksAgo(blocks: number, locale: string, blockMs = MAINNET_BLOCK_MS): string {
  const ms = blocks * blockMs
  const say = (value: number, unit: Intl.RelativeTimeFormatUnit) =>
    `~${new Intl.RelativeTimeFormat(locale, { numeric: 'always', style: 'short' }).format(-value, unit)}`
  if (ms < HOUR) return say(Math.max(1, Math.round(ms / 60_000)), 'minute')
  if (ms < 2 * DAY) return say(Math.round(ms / HOUR), 'hour')
  if (ms < 60 * DAY) return say(Math.round(ms / DAY), 'day')
  if (ms < 2 * YEAR) return say(Math.round(ms / (YEAR / 12)), 'month')
  return say(Math.round((ms / YEAR) * 10) / 10, 'year')
}

export interface MnColumnOptions {
  /** Some row carries Radar's crawl: its columns appear. */
  crawl: boolean
  /** The chain height the crawl was taken at, to say how many blocks ago a height was. 0 when unknown. */
  tip: number
  /** Average block spacing, to turn blocks into about how long ago. Undefined where Radar has no figure for the network. */
  blockMs?: number
}

export function statusLabel(row: MnRow): { tone: 'good' | 'warn' | 'bad' | 'none'; key: string } {
  if (row.status === 'pose-banned') return { tone: 'bad', key: 'banned' }
  const reachable = row.crawl?.reachable
  if (reachable === true) return { tone: 'good', key: 'answering' }
  if (reachable === false) return { tone: 'warn', key: 'silent' }
  return { tone: 'none', key: 'enabled' }
}

/** The list's columns. Ids are the `sort` names in the address; a column with a string accessor can filter by its cell. */
export function useMnColumns({ crawl, tip, blockMs }: MnColumnOptions): ColumnDef<MnRow>[] {
  const { t, i18n } = useLingui()
  const locale = i18n.locale
  return useMemo(() => {
    /** A height with, beside it, the same in the other unit: when it was, or how many blocks ago. */
    const when = (h: number | null | undefined, lead: 'time' | 'height') => {
      if (h == null || h <= 0) return DASH
      const behind = tip - h
      if (tip <= 0 || behind < 0) return formatInt(h)
      const ago = blockMs === undefined ? undefined : blocksAgo(behind, locale, blockMs)
      const blocks = plural(behind, { one: '# block', other: '# blocks' })
      return (
        <span className="rx-2l" title={t`Block ${formatInt(h)}`}>
          <span>{lead === 'time' ? (ago ?? blocks) : formatInt(h)}</span>
          <span className="rx-sub">
            {lead === 'time' ? (ago ? blocks : formatInt(h)) : (ago ?? blocks)}
          </span>
        </span>
      )
    }
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
          <span className="rx-mnid">
            <Entity
              kind={row.original.type === 'evo' ? 'evonode' : 'masternode'}
              id={row.original.protx}
            />
            {row.original.type === 'evo' ? (
              <span className="rx-sub" data-mn-type="evo">{t`Evonode`}</span>
            ) : null}
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
        meta: { phone: 'title' },
      },
      {
        id: 'address',
        header: t`Address`,
        accessorFn: (r) => r.service ?? '',
        cell: ({ row }) => <span className="rx-mnaddr">{row.original.service ?? DASH}</span>,
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
                <span className="rx-clip" title={c.city ?? undefined}>
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
            cell: ({ row }) => {
              const org = row.original.crawl?.as_org
              return org ? (
                <span className="rx-clip rx-clip--wide" title={org}>
                  {org}
                </span>
              ) : (
                DASH
              )
            },
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
            header: t`Uptime 7d`,
            accessorFn: (r) => r.crawl?.uptime_7d ?? 0,
            cell: ({ row }) => share(row.original.crawl?.uptime_7d),
            meta: { numeric: true, phone: 'hidden' },
          },
          {
            id: 'uptime_30d',
            header: t`Uptime 30d`,
            accessorFn: (r) => r.crawl?.uptime_30d ?? 0,
            cell: ({ row }) => share(row.original.crawl?.uptime_30d),
            meta: { numeric: true },
          },
          {
            id: 'last_paid',
            header: t`Last paid`,
            accessorFn: (r) => r.crawl?.last_paid_height ?? 0,
            cell: ({ row }) => when(row.original.crawl?.last_paid_height, 'time'),
            meta: { numeric: true },
          },
          {
            id: 'registered',
            header: t`Registered`,
            accessorFn: (r) => r.crawl?.registered_height ?? 0,
            cell: ({ row }) => when(row.original.crawl?.registered_height, 'height'),
            meta: { numeric: true, phone: 'hidden' },
          },
          {
            id: 'pose_penalty',
            header: t`PoSe`,
            accessorFn: (r) => r.crawl?.pose_penalty ?? 0,
            cell: ({ row }) => row.original.crawl?.pose_penalty ?? DASH,
            meta: { numeric: true, phone: 'hidden' },
          },
        ]
      : []
    return [...dapi, ...crawled, status, ...history]
  }, [t, locale, crawl, tip, blockMs])
}
