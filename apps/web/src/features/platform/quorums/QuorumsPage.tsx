import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { QuorumDto } from '@/data/sdk/methods'
import { sdkQueries } from '@/data/sdk/queries'
import { PageFrame, PageGroupTabs, useNetwork } from '@/features/entity'
import { formatInt } from '@/lib/format'
import { normalizeHex } from '@/lib/hex'
import {
  Badge,
  Card,
  DataTable,
  Hash,
  SearchField,
  TableTools,
  queryView,
  stampsOf,
  useAfterIdle,
} from '@/ui'

const NONE = {} as const

/** The quorums whose hash starts with `q` (hex, any case, with or without 0x) and whose type is among `types`. */
export function filterQuorums(
  quorums: readonly QuorumDto[],
  q: string | undefined,
  types: readonly string[] | undefined,
): QuorumDto[] {
  const prefix = q === undefined ? '' : normalizeHex(q)
  return quorums.filter(
    (x) =>
      x.quorumHash.startsWith(prefix) &&
      (types === undefined || types.length === 0 || types.includes(x.quorumType)),
  )
}

/** NX-55: the Platform quorums the answering node knows now. */
export function QuorumsPage() {
  const { t } = useLingui()
  const net = useNetwork()
  const { q, type } = useSearch({ from: '/quorums' })
  const navigate = useNavigate()
  const ready = useAfterIdle()
  const [draft, setDraft] = useState(q ?? '')
  const sent = useRef(q)
  useEffect(() => {
    if (q !== sent.current) {
      sent.current = q
      setDraft(q ?? '')
    }
  }, [q])
  const query = useQuery({ ...sdkQueries['system.currentQuorumsInfo'](net, NONE), enabled: ready })
  const all = useMemo(() => query.data?.data.quorums ?? [], [query.data])
  const types = useMemo(() => [...new Set(all.map((x) => x.quorumType))].sort(), [all])
  const rows = useMemo(() => filterQuorums(all, q, type), [all, q, type])
  const set = (change: { q?: string | undefined; type?: string[] | undefined }) => {
    void navigate({
      to: '/quorums',
      replace: true,
      search: ((prev: Record<string, unknown>) => ({ ...prev, ...change })) as never,
    })
  }
  const columns = useMemo<ColumnDef<QuorumDto>[]>(
    () => [
      {
        id: 'type',
        header: t`Type`,
        accessorFn: (r) => r.quorumType,
        meta: { phone: 'title' },
      },
      {
        id: 'hash',
        header: t`Quorum hash`,
        cell: ({ row }) => (
          <span data-quorum-hash={row.original.quorumHash}>
            <Hash value={row.original.quorumHash} display="wrap" phoneShort />
          </span>
        ),
        meta: { phone: 'primary' },
      },
      {
        id: 'members',
        header: t`Members`,
        accessorFn: (r) => formatInt(r.memberCount),
        meta: { numeric: true, phone: 'secondary' },
      },
      {
        id: 'threshold',
        header: t`Threshold`,
        accessorFn: (r) => formatInt(r.threshold),
        meta: { numeric: true, phone: 'secondary' },
      },
      {
        id: 'verified',
        header: t({ message: 'Verified', context: 'quorum is verified' }),
        cell: ({ row }) =>
          row.original.isVerified ? (
            <Badge tone="success">{t({ message: 'Verified', context: 'quorum is verified' })}</Badge>
          ) : (
            <Badge tone="warning">{t`Not verified`}</Badge>
          ),
        meta: { phone: 'hidden' },
      },
    ],
    [t],
  )
  const selected = type ?? []
  return (
    <PageFrame
      path="/quorums"
      title={t`Quorums`}
      eyebrow={t`Platform`}
      layer="platform"
      lede={t`The quorums Platform’s nodes currently know, with their size and signing threshold.`}
    >
      <PageGroupTabs group="chain" />
      <Card
        id="quorums"
        layer="platform"
        title={t`Current quorums`}
        subtitle={
          query.data
            ? t`${formatInt(all.length)} quorums at Platform height ${formatInt(query.data.data.height)}. Not proof-checked: the SDK has no proof for this list.`
            : t`Not proof-checked: the SDK has no proof for this list.`
        }
        padding="flush"
        source={stampsOf(query.data)}
      >
        <div className="p-3">
          <TableTools>
            <SearchField
              label={t`Quorum hash starts with`}
              placeholder={t`Hash prefix`}
              value={draft}
              onChange={(value) => {
                const next = value.trim() === '' ? undefined : value.trim()
                setDraft(value)
                sent.current = next
                set({ q: next })
              }}
            />
            <div className="dh-seg rx-seg" role="group" aria-label={t`Quorum type`}>
              {types.map((ty) => {
                const on = selected.includes(ty)
                return (
                  <button
                    key={ty}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      const next = on ? selected.filter((s) => s !== ty) : [...selected, ty]
                      set({ type: next.length === 0 ? undefined : next })
                    }}
                  >
                    {ty}
                  </button>
                )
              })}
            </div>
          </TableTools>
        </div>
        <DataTable
          caption={t`Current Platform quorums`}
          columns={columns}
          rows={rows}
          getRowId={(r) => r.quorumHash}
          {...queryView(query)}
          empty={
            all.length === 0 ? t`The node reported no quorums.` : t`No quorum matches this filter.`
          }
        />
      </Card>
    </PageFrame>
  )
}
