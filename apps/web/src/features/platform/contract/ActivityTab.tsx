import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, type LinkProps } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo, type FormEvent } from 'react'
import { peQueries } from '@/data/pe/queries'
import type { PeContractTransaction, PeDocument, PeTransaction } from '@/data/pe/schemas'
import { IdentityRef, TransitionTable } from '@/features/entity'
import { isDevnet } from '@/lib/network'
import { Badge, Card, DataTable, DateRangeFilter, Empty, Hash, Time, Unavailable } from '@/ui'
import { typeNames, usePeEnabled } from './contract-data'
import type { ContractContext } from './contract-context'

const PAGE_SIZE = 25

const startOf = (day: string) => `${day}T00:00:00.000Z`
const endOf = (day: string) => `${day}T23:59:59.999Z`

type Search = ContractContext['search']

/** The contract's own address with some search fields replaced; `page` goes back to the first. */
function searchLink(id: string, patch: Partial<Search>): LinkProps {
  return {
    to: '/contract/$id',
    params: { id },
    search: (s: Record<string, unknown>) => ({ ...s, page: undefined, ...patch }),
  } as LinkProps
}

function pageLink(id: string, page: number): LinkProps {
  return {
    to: '/contract/$id',
    params: { id },
    search: (s: Record<string, unknown>) => ({ ...s, page: page <= 1 ? undefined : page }),
  } as LinkProps
}

function Filters({ ctx, documents }: { ctx: ContractContext; documents: boolean }) {
  const { t } = useLingui()
  const navigate = useNavigate()
  const { id, search, contract } = ctx
  const apply = (patch: Partial<Search>) => {
    void navigate({
      to: '/contract/$id',
      params: { id },
      search: (s: Record<string, unknown>) => ({ ...s, page: undefined, ...patch }),
      replace: true,
    } as never)
  }
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    const owner = String(data.get('owner') ?? '').trim()
    const rev = String(data.get('rev') ?? '').trim()
    apply({
      owner: owner === '' ? undefined : owner,
      rev: /^\d+$/.test(rev) ? Number(rev) : undefined,
    })
  }
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={submit}
      aria-label={t`Filters`}
      data-activity-filters
    >
      {documents ? (
        <label className="grid gap-1">
          <span className="text-ink-2">{t`Document type`}</span>
          <select
            className="dh-select dh-select--sm"
            value={search.type ?? ''}
            onChange={(e) => {
              apply({ type: e.target.value === '' ? undefined : e.target.value })
            }}
          >
            <option value="">{t`All types`}</option>
            {typeNames(contract).map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="grid gap-1">
        <span className="text-ink-2">{t`Owner`}</span>
        <input
          className="dh-input dh-input--sm font-mono"
          name="owner"
          defaultValue={search.owner ?? ''}
          placeholder={t`Identity ID`}
          spellCheck={false}
          autoComplete="off"
        />
      </label>
      {documents ? (
        <label className="grid gap-1">
          <span className="text-ink-2">{t`Revision at least`}</span>
          <input
            className="dh-input dh-input--sm w-28"
            name="rev"
            inputMode="numeric"
            defaultValue={search.rev ?? ''}
            autoComplete="off"
          />
        </label>
      ) : null}
      <DateRangeFilter
        label={t`Date`}
        {...(search.from === undefined ? {} : { from: search.from })}
        {...(search.to === undefined ? {} : { to: search.to })}
        onChange={(range) => {
          apply({ from: range.from, to: range.to })
        }}
      />
      <button type="submit" className="dh-btn dh-btn--sm">
        {t`Apply`}
      </button>
      <Link
        className="dh-btn dh-btn--sm"
        {...searchLink(id, {
          type: undefined,
          owner: undefined,
          rev: undefined,
          from: undefined,
          to: undefined,
        })}
      >
        {t`Clear filters`}
      </Link>
    </form>
  )
}

/** A contract's transitions have no status of their own: Platform Explorer reports an error or none. */
const asTransition = (r: PeContractTransaction): PeTransaction => ({
  hash: r.hash,
  type: r.type,
  batchType: null,
  timestamp: r.timestamp,
  gasUsed: r.gasUsed ?? null,
  status: r.error ? 'FAIL' : 'SUCCESS',
  error: r.error ?? null,
  owner: r.owner ?? null,
})

function TransactionsView({ ctx }: { ctx: ContractContext }) {
  const { t } = useLingui()
  const { net, id, search } = ctx
  const query = useQuery(
    peQueries.dataContractTransactions(net, id, {
      page: search.page,
      limit: PAGE_SIZE,
      order: 'desc',
    }),
  )
  const all = query.data?.data.items ?? []
  const rows = all
    .filter((r) => (search.owner ? r.owner?.identifier === search.owner : true))
    .filter((r) => (search.from ? r.timestamp >= Date.parse(startOf(search.from)) : true))
    .filter((r) => (search.to ? r.timestamp <= Date.parse(endOf(search.to)) : true))
    .map(asTransition)
  const total = query.data?.data.total
  return (
    <div className="grid gap-3">
      <p className="text-ink-2">{t`Owner and date narrow the rows on this page; Platform Explorer pages the contract’s transitions by time.`}</p>
      <TransitionTable
        rows={rows}
        state={
          query.isPending
            ? 'loading'
            : query.isError && !query.data
              ? 'error'
              : rows.length === 0
                ? 'empty'
                : 'ready'
        }
        error={query.error}
        onRetry={() => {
          void query.refetch()
        }}
        columns={['type', 'hash', 'status', 'gas', 'owner', 'time']}
        caption={t`Transitions on this contract`}
        empty={<Empty kind="no-match" title={t`No transitions match.`} />}
        paging={{
          kind: 'page',
          page: search.page,
          limit: PAGE_SIZE,
          ...(total === undefined ? {} : { total }),
          to: (p) => pageLink(id, p),
        }}
        {...(query.data ? { source: query.data } : {})}
      />
    </div>
  )
}

function DocumentsView({ ctx }: { ctx: ContractContext }) {
  const { t } = useLingui()
  const { net, id, search } = ctx
  const query = useQuery(
    peQueries.dataContractDocuments(net, id, {
      page: search.page,
      limit: PAGE_SIZE,
      order: 'desc',
      document_type_name: search.type,
      owner: search.owner,
      revision_min: search.rev === undefined ? undefined : String(search.rev),
      timestamp_start: search.from ? startOf(search.from) : undefined,
      timestamp_end: search.to ? endOf(search.to) : undefined,
    }),
  )
  const rows = query.data?.data.items ?? []
  const total = query.data?.data.total
  const columns = useMemo<ColumnDef<PeDocument>[]>(
    () => [
      {
        id: 'document',
        header: t`Document`,
        cell: ({ row }) => <Hash value={row.original.identifier} copy={false} />,
        meta: { phone: 'title' },
      },
      {
        id: 'type',
        header: t`Type`,
        cell: ({ row }) => (
          <span className="font-mono">{row.original.documentTypeName ?? '—'}</span>
        ),
        meta: { phone: 'secondary' },
      },
      {
        id: 'revision',
        header: t`Revision`,
        cell: ({ row }) => row.original.revision ?? '—',
        meta: { numeric: true, phone: 'secondary' },
      },
      {
        id: 'owner',
        header: t`Owner`,
        cell: ({ row }) =>
          row.original.owner?.identifier ? <IdentityRef id={row.original.owner.identifier} /> : '—',
      },
      {
        id: 'state',
        header: t`State`,
        cell: ({ row }) =>
          row.original.deleted ? <Badge size="sm" tone="danger">{t`Deleted`}</Badge> : '—',
        meta: { phone: 'hidden' },
      },
      {
        id: 'time',
        header: t`Time`,
        cell: ({ row }) =>
          row.original.timestamp == null ? (
            '—'
          ) : (
            <Time ms={row.original.timestamp} mode="relative" live />
          ),
        meta: { phone: 'primary' },
      },
    ],
    [t],
  )
  return (
    <DataTable
      caption={t`Documents of this contract`}
      columns={columns}
      rows={rows}
      getRowId={(r) => r.identifier}
      state={
        query.isPending
          ? 'loading'
          : query.isError && !query.data
            ? 'error'
            : rows.length === 0
              ? 'empty'
              : 'ready'
      }
      error={query.error}
      onRetry={() => {
        void query.refetch()
      }}
      empty={<Empty kind="no-match" title={t`No documents match.`} />}
      rowLink={(r) =>
        ({
          to: '/document/$contract/$type/$id',
          params: { contract: id, type: r.documentTypeName ?? 'unknown', id: r.identifier },
        }) as never
      }
      paging={{
        kind: 'page',
        page: search.page,
        limit: PAGE_SIZE,
        ...(total === undefined ? {} : { total }),
        to: (p) => pageLink(id, p),
      }}
      {...(query.data ? { source: query.data } : {})}
    />
  )
}

/** Platform Explorer's record of what happened on a contract: its transitions and its documents. */
export function ActivityTab({
  ctx,
  kind,
}: {
  ctx: ContractContext
  kind: 'transactions' | 'documents'
}) {
  const { t } = useLingui()
  const enabled = usePeEnabled(ctx.net)
  const title = kind === 'transactions' ? t`Transitions` : t`Documents`
  return (
    <Card title={title} layer="platform" id={kind}>
      {isDevnet(ctx.net) ? (
        <Empty
          kind="unsupported-network"
          title={t`Platform Explorer doesn’t cover devnets.`}
          body={t`Use the documents browser to read this contract’s documents.`}
        />
      ) : !enabled ? (
        <Unavailable source="pe" title={t`Contract activity needs Platform Explorer`} />
      ) : (
        <div className="grid gap-4">
          <Filters ctx={ctx} documents={kind === 'documents'} />
          {kind === 'transactions' ? <TransactionsView ctx={ctx} /> : <DocumentsView ctx={ctx} />}
        </div>
      )}
    </Card>
  )
}
