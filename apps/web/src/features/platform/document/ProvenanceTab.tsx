import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import type { LinkProps } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'
import { peQueries } from '@/data/pe/queries'
import type { PeDocument } from '@/data/pe/schemas'
import { Entity } from '@/features/entity'
import { isDevnet } from '@/lib/network'
import { formatInt } from '@/lib/format'
import { Badge, Card, DataTable, Empty, KeyValue, Time, Unavailable } from '@/ui'
import { usePeEnabled } from '../contract/contract-data'
import type { DocumentContext } from './DocumentPage'

const PAGE_SIZE = 25

function pageLink(ctx: DocumentContext, page: number): LinkProps {
  return {
    to: '/document/$contract/$type/$id',
    params: { contract: ctx.contract, type: ctx.type, id: ctx.id },
    search: (s: Record<string, unknown>) => ({
      ...s,
      tab: 'provenance',
      page: page <= 1 ? undefined : page,
    }),
  } as LinkProps
}

/** Platform Explorer's record of the transition that created or last changed the document, and of its revisions. */
export function ProvenanceTab({ ctx }: { ctx: DocumentContext }) {
  const { t } = useLingui()
  const enabled = usePeEnabled(ctx.net)
  return (
    <Card title={t`Provenance`} layer="platform" id="provenance">
      {isDevnet(ctx.net) ? (
        <Empty
          kind="unsupported-network"
          title={t`Platform Explorer doesn’t cover devnets.`}
          body={t`The document’s data and metadata above come straight from Platform.`}
        />
      ) : !enabled ? (
        <Unavailable
          source="pe"
          title={t`Which transition wrote a document needs Platform Explorer`}
        />
      ) : (
        <Provenance ctx={ctx} />
      )}
    </Card>
  )
}

function Provenance({ ctx }: { ctx: DocumentContext }) {
  const { t } = useLingui()
  const { net, id, contract, type, page } = ctx
  const record = useQuery(
    peQueries.document(net, id, { contractId: contract, documentTypeName: type }),
  )
  const revisions = useQuery(
    peQueries.documentRevisions(net, id, { page, limit: PAGE_SIZE, order: 'desc' }),
  )
  const doc = record.data?.data ?? null
  const rows = revisions.data?.data.items ?? []
  const total = revisions.data?.data.total
  const columns = useMemo<ColumnDef<PeDocument>[]>(
    () => [
      {
        id: 'revision',
        header: t`Revision`,
        cell: ({ row }) => row.original.revision ?? '—',
        meta: { numeric: true, phone: 'title' },
      },
      {
        id: 'transition',
        header: t`Transition`,
        cell: ({ row }) =>
          row.original.txHash ? (
            <Entity kind="transition" id={row.original.txHash.toLowerCase()} />
          ) : (
            '—'
          ),
        meta: { phone: 'primary' },
      },
      {
        id: 'action',
        header: t`Action`,
        cell: ({ row }) =>
          row.original.deleted ? (
            <Badge tone="danger" size="sm">{t`Deleted`}</Badge>
          ) : (
            (row.original.transitionType ?? '—')
          ),
      },
      {
        id: 'time',
        header: t`Time`,
        cell: ({ row }) =>
          row.original.timestamp == null ? '—' : <Time ms={row.original.timestamp} mode="both" />,
        meta: { phone: 'secondary' },
      },
    ],
    [t],
  )
  return (
    <div className="grid gap-4">
      <section className="grid gap-2" aria-label={t`Latest transition`} data-provenance-latest>
        <h4 className="font-semibold">{t`Created or last changed by`}</h4>
        {record.isPending ? (
          <p className="text-ink-2">…</p>
        ) : record.isError && !record.data ? (
          <p role="status" className="text-ink-2">
            {t`Platform Explorer didn’t answer, so the transition isn’t known.`}
          </p>
        ) : !doc ? (
          <Empty kind="none-yet" title={t`Platform Explorer has no record of this document yet.`} />
        ) : (
          <KeyValue
            columns={2}
            items={[
              {
                label: t`Transition`,
                value: doc.txHash ? (
                  <Entity kind="transition" id={doc.txHash.toLowerCase()} />
                ) : (
                  '—'
                ),
              },
              {
                label: t`Revision`,
                value: doc.revision == null ? '—' : formatInt(doc.revision),
              },
              {
                label: t`Time`,
                value: doc.timestamp == null ? '—' : <Time ms={doc.timestamp} mode="both" />,
              },
              ...(doc.transitionType ? [{ label: t`Action`, value: doc.transitionType }] : []),
            ]}
          />
        )}
      </section>
      <DataTable
        caption={t`Revisions recorded by Platform Explorer`}
        columns={columns}
        rows={rows}
        getRowId={(r) => `${r.revision ?? 'r'}:${r.txHash ?? ''}`}
        state={
          revisions.isPending
            ? 'loading'
            : revisions.isError && !revisions.data
              ? 'error'
              : rows.length === 0
                ? 'empty'
                : 'ready'
        }
        error={revisions.error}
        onRetry={() => {
          void revisions.refetch()
        }}
        empty={<Empty kind="none-yet" title={t`No revisions recorded.`} />}
        paging={{
          kind: 'page',
          page,
          limit: PAGE_SIZE,
          ...(total === undefined ? {} : { total }),
          to: (p) => pageLink(ctx, p),
        }}
        {...(revisions.data ? { source: revisions.data } : {})}
      />
    </div>
  )
}
