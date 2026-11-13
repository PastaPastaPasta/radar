import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, type LinkProps } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'
import { stampOf } from '@/data/envelope'
import { sdkQueries } from '@/data/sdk/queries'
import type { DocumentDto } from '@/data/sdk/methods'
import { IdentityRef, PageFrame, useNetwork } from '@/features/entity'
import { isPlatformId } from '@/lib/base58'
import { encodeWhere } from '@/lib/search-schemas'
import { systemContract } from '@/lib/well-known'
import { Card, DataTable, Empty, ErrorState, Hash, Skeleton, Time } from '@/ui'
import { propertyNames, useContract } from './contract-data'
import { DocFilters, type FilterValues } from './DocFilters'
import { filterIndices } from './doc-filters'
import {
  DRIVE_MAX,
  hasMore,
  nextCursor,
  planQuery,
  prevCursor,
  type DocumentsSearch,
} from './doc-query'
import { problemText } from './problem-text'
import { cellText } from './cell-text'

export interface DocumentsPageProps {
  id: string
  type: string
  search: DocumentsSearch
}

export const PAGE_SIZES = [10, 25, 50, 100] as const
const MAX_PROPERTY_COLUMNS = 6

function documentsLink(id: string, type: string, patch: Partial<DocumentsSearch>): LinkProps {
  return {
    to: '/contract/$id/documents/$type',
    params: { id, type },
    search: (s: Record<string, unknown>) => ({ ...s, ...patch }),
  } as LinkProps
}

export function DocumentsPage({ id, type, search }: DocumentsPageProps) {
  const { t } = useLingui()
  const net = useNetwork()
  const contract = useContract(net, id)
  const data = contract.data?.data ?? null
  const schema = data?.documentSchemas[type] as Record<string, unknown> | undefined

  return (
    <PageFrame
      path="/contract/$id/documents/$type"
      title={t`Documents`}
      eyebrow={t`Platform`}
      layer="platform"
      lede={
        <span className="font-mono" data-documents-of>
          {type}
        </span>
      }
    >
      <nav aria-label={t`Back to the contract`}>
        <Link
          className="dh-btn dh-btn--sm"
          to="/contract/$id"
          params={{ id }}
          search={{ tab: 'types' } as never}
        >
          {t`Back to the contract`}
        </Link>
      </nav>
      {!isPlatformId(id) ? (
        <Empty
          kind="not-found"
          title={t`That isn’t a contract ID.`}
          body={<Hash value={id} display="wrap" copy={false} />}
        />
      ) : contract.isPending ? (
        <Skeleton shape="block" height={220} />
      ) : contract.isError && !contract.data ? (
        <ErrorState
          error={contract.error}
          source="sdk"
          onRetry={() => {
            void contract.refetch()
          }}
        />
      ) : !data || !contract.data ? (
        <Empty
          kind="not-found"
          title={t`No contract has this ID on this network.`}
          body={<Hash value={id} display="wrap" />}
        />
      ) : !schema ? (
        <Empty
          kind="not-found"
          title={t`This contract has no document type “${type}”.`}
          body={
            <Link to="/contract/$id" params={{ id }} search={{ tab: 'types' } as never}>
              {t`See its document types`}
            </Link>
          }
        />
      ) : (
        <Browser
          id={id}
          type={type}
          schema={schema}
          indices={data.indices[type]}
          search={search}
          contractStamp={stampOf(contract.data)}
        />
      )}
    </PageFrame>
  )
}

interface BrowserProps {
  id: string
  type: string
  schema: Record<string, unknown>
  indices: Parameters<typeof filterIndices>[0]
  search: DocumentsSearch
  contractStamp: ReturnType<typeof stampOf>
}

function Browser({ id, type, schema, indices, search, contractStamp }: BrowserProps) {
  const { t, i18n } = useLingui()
  const net = useNetwork()
  const navigate = useNavigate()
  const plan = useMemo(
    () =>
      planQuery({
        contractId: id,
        type,
        indices,
        schema,
        search,
        dpnsDomain: id === systemContract('dpns').id && type === 'domain',
      }),
    [id, type, indices, schema, search],
  )
  const query = useQuery({
    ...sdkQueries['documents.query'](net, plan.args ?? { contractId: id, type }),
    enabled: plan.args !== undefined,
  })
  const returned = query.data?.data ?? []
  const more = hasMore(returned.length, search.limit)
  const rows = returned.slice(0, search.limit)
  const last = rows.at(-1)
  const nextSearch = last ? nextCursor(search, last.id) : null
  const prevSearch = prevCursor(search)
  const columns = useDocumentColumns(schema)

  const run = (values: FilterValues) => {
    void navigate({
      to: '/contract/$id/documents/$type',
      params: { id, type },
      search: (s: Record<string, unknown>) => ({
        ...s,
        where: values.where.length > 0 ? values.where : undefined,
        order: values.order.length > 0 ? values.order : undefined,
        limit: values.limit,
        after: undefined,
        prev: undefined,
      }),
    } as never)
  }
  const filterKey = `${encodeWhere(search.where ?? [])}|${(search.order ?? []).join(',')}|${search.limit}`
  const state =
    plan.args === undefined
      ? 'empty'
      : query.isPending
        ? 'loading'
        : query.isError && !query.data
          ? 'error'
          : rows.length === 0
            ? 'empty'
            : 'ready'

  return (
    <div className="grid gap-4">
      <Card title={t`Query`} layer="platform" id="query" source={contractStamp}>
        <div className="grid gap-3">
          <DocFilters
            key={filterKey}
            indices={filterIndices(indices)}
            schema={schema}
            initial={{ where: search.where ?? [], order: search.order ?? [], limit: search.limit }}
            limits={PAGE_SIZES}
            onRun={run}
            onClear={() => {
              void navigate({
                to: '/contract/$id/documents/$type',
                params: { id, type },
                search: (s: Record<string, unknown>) => ({
                  ...s,
                  where: undefined,
                  order: undefined,
                  after: undefined,
                  prev: undefined,
                }),
              } as never)
            }}
          />
          {plan.conversions.length > 0 ? (
            <p className="text-ink-2" data-conversions>
              {plan.conversions
                .map(
                  (c) =>
                    t`${c.field}: searching “${c.searched}” for “${c.typed}” (DPNS stores o, i and l as 0, 1 and 1)`,
                )
                .join(' · ')}
            </p>
          ) : null}
        </div>
      </Card>
      <Card
        title={t`Documents`}
        layer="platform"
        id="results"
        source={query.data ? stampOf(query.data) : undefined}
      >
        {plan.problems.length > 0 ? (
          <ul className="grid gap-1" role="alert" data-url-problems>
            {plan.problems.map((p, i) => (
              <li key={i}>{problemText(i18n, p)}</li>
            ))}
          </ul>
        ) : query.isError && !query.data ? (
          <div className="grid gap-3">
            <ErrorState
              error={query.error}
              source="sdk"
              onRetry={() => {
                void query.refetch()
              }}
            />
            <pre
              className="overflow-x-auto whitespace-pre-wrap break-words rounded p-3 font-mono"
              data-platform-error
            >
              {query.error instanceof Error ? query.error.message : String(query.error)}
            </pre>
          </div>
        ) : (
          <DataTable
            caption={t`Documents of type ${type}`}
            columns={columns}
            rows={rows}
            getRowId={(r) => r.id}
            state={state}
            empty={
              <Empty
                kind={search.where?.length || search.after ? 'no-match' : 'none-yet'}
                title={search.after ? t`No more documents.` : t`No documents match.`}
                body={
                  search.where?.length
                    ? t`Change or clear the filters to see more.`
                    : t`Nobody has created a document of this type yet.`
                }
              />
            }
            rowLink={(r) =>
              ({
                to: '/document/$contract/$type/$id',
                params: { contract: id, type, id: r.id },
              }) as never
            }
            paging={{
              kind: 'cursor',
              ...(more && nextSearch
                ? {
                    next: documentsLink(id, type, {
                      after: nextSearch.after,
                      prev: nextSearch.prev,
                    }),
                  }
                : {}),
              ...(prevSearch
                ? {
                    prev: documentsLink(id, type, {
                      after: prevSearch.after,
                      prev: prevSearch.prev,
                    }),
                  }
                : {}),
            }}
            {...(query.data ? { source: stampOf(query.data) } : {})}
          />
        )}
        {search.limit >= DRIVE_MAX ? (
          <p className="mt-2 text-ink-2">{t`Platform answers at most ${DRIVE_MAX} documents at a time.`}</p>
        ) : null}
      </Card>
    </div>
  )
}

function useDocumentColumns(schema: Record<string, unknown>): ColumnDef<DocumentDto>[] {
  const { t } = useLingui()
  return useMemo(() => {
    const names = propertyNames(schema).slice(0, MAX_PROPERTY_COLUMNS)
    const props: ColumnDef<DocumentDto>[] = names.map((name, i) => ({
      id: `p:${name}`,
      header: name,
      cell: ({ row }) => cellText(row.original.data[name]),
      meta: { phone: i === 0 ? 'primary' : 'secondary' },
    }))
    return [
      {
        id: 'id',
        header: '$id',
        cell: ({ row }) => <Hash value={row.original.id} copy={false} />,
        meta: { phone: 'title' },
      },
      ...props,
      {
        id: 'owner',
        header: '$ownerId',
        cell: ({ row }) => <IdentityRef id={row.original.ownerId} />,
        meta: { phone: 'secondary' },
      },
      {
        id: 'updated',
        header: '$updatedAt',
        cell: ({ row }) => {
          const at = row.original.updatedAt ?? row.original.createdAt
          return at === null ? t`—` : <Time ms={at} mode="relative" live />
        },
        meta: { phone: 'secondary' },
      },
    ]
  }, [schema, t])
}
