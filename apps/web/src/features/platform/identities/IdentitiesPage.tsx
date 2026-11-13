import type { MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import { useQueries, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import { stampOf, type SourceStamp } from '@/data/envelope'
import { useDecentralizedOnly } from '@/data/health'
import { peQueries } from '@/data/pe/queries'
import type { PeIdentity } from '@/data/pe/schemas'
import { sdkQueries } from '@/data/sdk/queries'
import { IdentityRef, PageFrame, useNetwork } from '@/features/entity'
import { readIdentityInput } from '../identity/ids'
import { formatInt } from '@/lib/format'
import {
  ActiveFilters,
  Amount,
  Badge,
  Card,
  DataTable,
  DateRangeFilter,
  Empty,
  ListModeToggle,
  RangeFilter,
  SegFilter,
  TableTools,
  Time,
  Unavailable,
  useListMode,
} from '@/ui'
import type { LinkProps } from '@tanstack/react-router'
import {
  IDENTITY_TYPES,
  inDateRange,
  peIdentitiesQuery,
  rangeText,
  type IdentitiesFilters,
} from './params'

const DEFAULT_LIMIT = 25

export function IdentitiesPage({ search }: { search: IdentitiesFilters }) {
  const { t } = useLingui()
  const decentralized = useDecentralizedOnly()
  return (
    <PageFrame
      path="/identities"
      title={t`Identities`}
      eyebrow={t`Platform`}
      layer="platform"
      lede={t`Every identity Platform Explorer has indexed, with its balance and activity.`}
    >
      {decentralized ? <FindIdentity /> : <IdentityList search={search} />}
    </PageFrame>
  )
}

function useSetFilters() {
  const navigate = useNavigate()
  return (patch: Record<string, unknown>) =>
    void navigate({
      to: '.',
      search: ((prev: Record<string, unknown>) => ({
        ...prev,
        page: undefined,
        ...patch,
      })) as never,
      replace: true,
      resetScroll: false,
    })
}

const TYPE_LABELS: Record<string, MessageDescriptor> = {
  regular: msg`Regular`,
  masternode: msg`Masternode`,
  masternode_voting: msg`Voting`,
  masternode_operator: msg`Operator`,
}

function IdentityList({ search }: { search: IdentitiesFilters }) {
  const { t, i18n } = useLingui()
  const typeLabel = (type: string): string => {
    const d = TYPE_LABELS[type]
    return d ? i18n._(d) : type
  }
  const net = useNetwork()
  const setFilters = useSetFilters()
  const listMode = useListMode('identities')
  const limit = search.limit !== DEFAULT_LIMIT ? search.limit : listMode.limit
  const filters: IdentitiesFilters = { ...search, limit }
  const scroll = listMode.mode === 'scroll'
  const [pagesShown, setPagesShown] = useState(1)

  const queries = useQueries({
    queries: Array.from({ length: scroll ? pagesShown : 1 }, (_, i) =>
      peQueries.identities(net, peIdentitiesQuery(filters, scroll ? i + 1 : search.page)),
    ),
  })
  const pages = queries.map((q) => q.data).filter((p) => p !== undefined)
  const rows = useMemo(
    () => pages.flatMap((p) => p.data.items).filter((r) => inDateRange(r, search.from, search.to)),
    [pages, search.from, search.to],
  )
  const first = queries[0]
  const last = queries[queries.length - 1]
  const total = pages[0]?.data.total
  const stamps: SourceStamp[] = pages.map(stampOf)

  const columns = useMemo<ColumnDef<PeIdentity>[]>(
    () => [
      {
        id: 'identity',
        header: t`Identity`,
        cell: ({ row }) => <IdentityRef id={row.original.identifier} />,
        enableSorting: false,
        meta: { phone: 'title' },
      },
      {
        id: 'type',
        header: t`Type`,
        cell: ({ row }) =>
          row.original.type ? <Badge>{typeLabel(row.original.type)}</Badge> : '—',
        enableSorting: false,
        meta: { phone: 'secondary' },
      },
      {
        id: 'balance',
        header: t`Balance`,
        accessorFn: (r) => r.balance ?? 0n,
        cell: ({ row }) =>
          row.original.balance === null || row.original.balance === undefined ? (
            '—'
          ) : (
            <Amount value={row.original.balance} kind="credits" fiat />
          ),
        meta: { align: 'end', numeric: true, phone: 'primary' },
      },
      {
        id: 'txs',
        header: t`Transitions`,
        accessorFn: (r) => r.totalTxs ?? 0,
        cell: ({ row }) => formatInt(row.original.totalTxs ?? 0),
        meta: { align: 'end', numeric: true, phone: 'secondary' },
      },
      {
        id: 'docs',
        header: t`Documents`,
        accessorFn: (r) => r.totalDocuments ?? 0,
        cell: ({ row }) => formatInt(row.original.totalDocuments ?? 0),
        enableSorting: false,
        meta: { align: 'end', numeric: true, phone: 'hidden' },
      },
      {
        id: 'contracts',
        header: t`Contracts`,
        accessorFn: (r) => r.totalDataContracts ?? 0,
        cell: ({ row }) => formatInt(row.original.totalDataContracts ?? 0),
        enableSorting: false,
        meta: { align: 'end', numeric: true, phone: 'hidden' },
      },
      {
        id: 'created',
        header: t`Created`,
        accessorFn: (r) => r.timestamp ?? 0,
        cell: ({ row }) =>
          row.original.timestamp ? <Time ms={row.original.timestamp} mode="absolute" /> : '—',
        meta: { phone: 'secondary' },
      },
    ],
    [t],
  )

  const type = search.type?.[0] ?? ''
  const tokens = [
    ...(type ? [{ id: 'type', label: t`Type: ${typeLabel(type)}` }] : []),
    ...(search.bal ? [{ id: 'bal', label: t`Balance ${rangeText(search.bal) ?? ''} DASH` }] : []),
    ...(search.txs ? [{ id: 'txs', label: t`Transitions ${rangeText(search.txs) ?? ''}` }] : []),
    ...(search.docs ? [{ id: 'docs', label: t`Documents ${rangeText(search.docs) ?? ''}` }] : []),
    ...(search.contracts
      ? [{ id: 'contracts', label: t`Contracts ${rangeText(search.contracts) ?? ''}` }]
      : []),
    ...(search.from || search.to
      ? [{ id: 'dates', label: t`Created ${search.from ?? ''}–${search.to ?? ''}` }]
      : []),
  ]
  const clear = (id: string) => {
    if (id === 'dates') setFilters({ from: undefined, to: undefined })
    else setFilters({ [id]: undefined })
  }
  const pageTo = (n: number): LinkProps =>
    ({
      to: '.',
      search: ((prev: Record<string, unknown>) => ({
        ...prev,
        page: n === 1 ? undefined : n,
      })) as never,
    }) as LinkProps

  return (
    <div className="grid gap-4">
      <TableTools>
        <SegFilter
          label={t`Identity type`}
          value={type}
          onChange={(id) => {
            setFilters({ type: id === '' ? undefined : [id] })
          }}
          options={[
            { id: '', label: t`All` },
            ...IDENTITY_TYPES.map((x) => ({ id: x, label: typeLabel(x) })),
          ]}
        />
        <RangeFilter
          label={t`Balance (DASH)`}
          value={rangeText(search.bal)}
          onChange={(v) => {
            setFilters({ bal: v })
          }}
        />
        <RangeFilter
          label={t`Transitions`}
          value={rangeText(search.txs)}
          onChange={(v) => {
            setFilters({ txs: v })
          }}
        />
        <RangeFilter
          label={t`Documents`}
          value={rangeText(search.docs)}
          onChange={(v) => {
            setFilters({ docs: v })
          }}
        />
        <RangeFilter
          label={t`Contracts`}
          value={rangeText(search.contracts)}
          onChange={(v) => {
            setFilters({ contracts: v })
          }}
        />
        <DateRangeFilter
          label={t`Created`}
          from={search.from}
          to={search.to}
          onChange={(r) => {
            setFilters({ from: r.from, to: r.to })
          }}
        />
        <ListModeToggle listId="identities" />
      </TableTools>
      {tokens.length > 0 ? (
        <ActiveFilters
          matches={total ?? rows.length}
          tokens={tokens}
          onRemove={clear}
          onClear={() => {
            setFilters({
              type: undefined,
              bal: undefined,
              txs: undefined,
              docs: undefined,
              contracts: undefined,
              from: undefined,
              to: undefined,
            })
          }}
        >
          {search.from || search.to
            ? t`The dates narrow the identities on the page being shown.`
            : null}
        </ActiveFilters>
      ) : null}
      <Card layer="platform" id="identities-list" source={stamps.length > 0 ? stamps : undefined}>
        <DataTable
          caption={t`Identities`}
          columns={columns}
          rows={rows}
          getRowId={(r) => r.identifier}
          state={first?.isPending ? 'loading' : first?.isError && !first.data ? 'error' : 'ready'}
          error={first?.error}
          onRetry={() => void first?.refetch()}
          sort={{
            value: search.sort,
            onChange: (sort) => {
              setFilters({ sort })
            },
          }}
          paging={
            scroll
              ? {
                  kind: 'infinite',
                  hasNext: (last?.data?.data.items.length ?? 0) >= limit,
                  fetchNext: () => {
                    setPagesShown((n) => n + 1)
                  },
                  fetching: last?.isFetching === true && last.data === undefined,
                }
              : { kind: 'page', page: search.page, limit, total, to: pageTo }
          }
          empty={<Empty kind="no-match" title={t`No identities match.`} />}
        />
      </Card>
    </div>
  )
}

function FindIdentity() {
  const { t } = useLingui()
  const net = useNetwork()
  const navigate = useNavigate()
  const client = useQueryClient()
  const [draft, setDraft] = useState('')
  const [problem, setProblem] = useState<string>()
  const [busy, setBusy] = useState(false)
  const open = (id: string) =>
    void navigate({
      to: '/identity/$id',
      params: { id },
      search: ((prev: Record<string, unknown>) => ({
        network: prev.network,
        sources: prev.sources,
      })) as never,
    })
  return (
    <div className="grid gap-4">
      <Unavailable title={t`Platform keeps no list of identities, so the list needs an indexer`} />
      <Card title={t`Open an identity`} layer="platform">
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            const value = draft.trim()
            const input = readIdentityInput(value)
            if (input.kind !== 'invalid') {
              open(input.id)
              return
            }
            const name = value.replace(/\.dash$/i, '')
            if (!/^[A-Za-z0-9-]{3,63}$/.test(name)) {
              setProblem(t`Enter an identity ID or a name such as alice.dash.`)
              return
            }
            setProblem(undefined)
            setBusy(true)
            void client
              .fetchQuery(sdkQueries['dpns.getUsernameByName'](net, { name }))
              .then((found) => {
                if (found.data) open(found.data.identityId)
                else setProblem(t`No identity owns the name ${name}.`)
              })
              .catch(() => {
                setProblem(t`The name couldn’t be looked up right now.`)
              })
              .finally(() => {
                setBusy(false)
              })
          }}
        >
          <label className="flex flex-wrap items-center gap-2">
            <span>{t`Identity ID or name`}</span>
            <input
              className="dh-input"
              value={draft}
              spellCheck={false}
              autoComplete="off"
              aria-invalid={problem ? true : undefined}
              onChange={(e) => {
                setDraft(e.target.value)
              }}
            />
          </label>
          <button type="submit" className="dh-btn" disabled={busy}>
            {t`Open`}
          </button>
          {problem ? (
            <span role="alert" className="text-bad">
              {problem}
            </span>
          ) : null}
        </form>
      </Card>
    </div>
  )
}
