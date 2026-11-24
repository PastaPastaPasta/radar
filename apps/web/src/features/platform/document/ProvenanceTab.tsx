import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'
import { stampOf } from '@/data/envelope'
import { peQueries } from '@/data/pe/queries'
import type { PeDocument } from '@/data/pe/schemas'
import { Entity, ScrollList, pagePosition } from '@/features/entity'
import { isDevnet } from '@/lib/network'
import { formatInt } from '@/lib/format'
import { Badge, Card, DataTable, Empty, KeyValue, SourceLine, Time, Unavailable } from '@/ui'
import { usePeEnabled } from '../contract/contract-data'
import { usePeScroll } from '../pe-scroll'
import type { DocumentContext } from './DocumentPage'

const PAGE_SIZE = 25

const revisionId = (r: PeDocument) => `${r.revision ?? 'r'}:${r.txHash ?? ''}`

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
  const revisions = usePeScroll({
    listKey: id,
    start: page,
    limit: PAGE_SIZE,
    page: (n) => peQueries.documentRevisions(net, id, { page: n, limit: PAGE_SIZE, order: 'desc' }),
    getRowId: revisionId,
  })
  const doc = record.data?.data ?? null
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
          <>
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
            {record.data ? <SourceLine stamp={stampOf(record.data)} /> : null}
          </>
        )}
      </section>
      <ScrollList chain={revisions} position={pagePosition}>
        <DataTable
          caption={t`Revisions recorded by Platform Explorer`}
          columns={columns}
          rows={revisions.rows}
          getRowId={revisionId}
          state={revisions.state}
          error={revisions.error}
          onRetry={revisions.onRetry}
          empty={<Empty kind="none-yet" title={t`No revisions recorded.`} />}
          paging={revisions.paging}
          source={revisions.stamps[0]}
        />
      </ScrollList>
    </div>
  )
}
