import { useLingui } from '@lingui/react/macro'
import { Link, useNavigate } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'
import { stampOf } from '@/data/envelope'
import { sdkQueries } from '@/data/sdk/queries'
import type { DocumentDto, DocumentsQueryArgs } from '@/data/sdk/methods'
import {
  chainStamps,
  IdentityRef,
  PageFrame,
  ScrollList,
  useNetwork,
  usePageChain,
} from '@/features/entity'
import { isPlatformId } from '@/lib/base58'
import { encodeWhere, escapeListItem } from '@/lib/search-schemas'
import { systemContract } from '@/lib/well-known'
import { Card, DataTable, Empty, ErrorState, Hash, Skeleton, Time } from '@/ui'
import { propertyNames, useContract } from './contract-data'
import { DocFilters, type FilterValues } from './DocFilters'
import { filterIndices } from './doc-filters'
import { DRIVE_MAX, hasMore, planQuery, type DocumentsSearch } from './doc-query'
import { cellText } from './cell-text'
import { SdkGate } from './SdkGate'

export interface DocumentsPageProps {
  id: string
  type: string
  search: DocumentsSearch
}

const PAGE_SIZES = [10, 25, 50, 100] as const
const MAX_PROPERTY_COLUMNS = 3

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
      ) : (
        <SdkGate query={contract} skeleton={<Skeleton shape="block" height={220} />}>
          {!data || !contract.data ? (
            <Empty
              kind="not-found"
              title={t`No contract has this ID on this network.`}
              body={<Hash value={id} display="wrap" />}
              source={contract.data ? stampOf(contract.data) : undefined}
            />
          ) : !schema ? (
            <Empty
              kind="not-found"
              title={t`This contract has no document type “${type}”.`}
              source={contract.data ? stampOf(contract.data) : undefined}
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
        </SdkGate>
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

function withCursor(args: DocumentsQueryArgs, after: string | undefined): DocumentsQueryArgs {
  const rest = { ...args }
  delete rest.startAfter
  return after ? { ...rest, startAfter: after } : rest
}

/** Writes the cursor of the page in view as `after`, and the cursors of the pages above it as `prev`. */
function documentsPosition(url: URL, after: string | undefined, earlier: (string | undefined)[]) {
  const stack = earlier.filter((c): c is string => c !== undefined)
  if (after === undefined) url.searchParams.delete('after')
  else url.searchParams.set('after', after)
  if (stack.length === 0) url.searchParams.delete('prev')
  else url.searchParams.set('prev', stack.map(escapeListItem).join(','))
}

function Browser({ id, type, schema, indices, search, contractStamp }: BrowserProps) {
  const { t } = useLingui()
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
  const { args } = plan
  const list = usePageChain({
    listKey: JSON.stringify({ ...args, startAfter: undefined }),
    start: search.after,
    earlier: search.after ? [undefined, ...(search.prev ?? [])] : undefined,
    query: (after: string | undefined) =>
      sdkQueries['documents.query'](net, withCursor(args ?? { contractId: id, type }, after)),
    rows: (p) => p.data.slice(0, search.limit),
    getRowId: (r) => r.id,
    next: (p) =>
      hasMore(p.data.length, search.limit) ? p.data.slice(0, search.limit).at(-1)?.id : undefined,
    enabled: args !== undefined,
  })
  const firstFailed = list.state === 'error'
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
                  ({ field, searched, typed }) =>
                    t`${field}: searching “${searched}” for “${typed}” (DPNS stores o, i and l as 0, 1 and 1)`,
                )
                .join(' · ')}
            </p>
          ) : null}
        </div>
      </Card>
      <Card title={t`Documents`} layer="platform" id="results" source={chainStamps(list.pages)}>
        {plan.problems.length > 0 ? (
          <Empty
            kind="no-match"
            title={t`Won’t run`}
            body={t`Change or clear the filters to see more.`}
          />
        ) : firstFailed ? (
          <div className="grid gap-3">
            <ErrorState error={list.error} source="sdk" onRetry={list.onRetry} />
            <pre
              className="overflow-x-auto whitespace-pre-wrap break-words rounded p-3 font-mono"
              data-platform-error
            >
              {list.error instanceof Error ? list.error.message : String(list.error)}
            </pre>
          </div>
        ) : (
          <ScrollList chain={list} position={documentsPosition}>
            <DataTable
              caption={t`Documents of type ${type}`}
              columns={columns}
              rows={list.rows}
              getRowId={list.getRowId}
              state={args === undefined ? 'empty' : list.state}
              paging={list.paging}
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
            />
          </ScrollList>
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
