import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { Link, type LinkProps } from '@tanstack/react-router'
import { stampOf, type SourceStamp } from '@/data/envelope'
import { sdkQueries } from '@/data/sdk/queries'
import type { DocumentDto } from '@/data/sdk/methods'
import { Entity, IdentityRef, PageFrame, useNetwork } from '@/features/entity'
import { isPlatformId } from '@/lib/base58'
import { Badge, Card, Empty, Hash, JsonView, KeyValue, LinkOut, Skeleton, Tabs, Time } from '@/ui'
import { typeKeepsHistory, useContract } from '../contract/contract-data'
import { SdkGate } from '../contract/SdkGate'
import { ProvenanceTab } from './ProvenanceTab'
import { RevisionsTab } from './RevisionsTab'

export type DocumentTab = 'data' | 'meta' | 'revisions' | 'provenance'

export interface DocumentPageProps {
  contract: string
  type: string
  id: string
  search: { tab: DocumentTab; page: number }
}

export interface DocumentContext {
  net: ReturnType<typeof useNetwork>
  contract: string
  type: string
  id: string
  doc: DocumentDto
  stamp: SourceStamp
  keepsHistory: boolean
  page: number
}

export function DocumentPage({ contract, type, id, search }: DocumentPageProps) {
  const { t } = useLingui()
  const net = useNetwork()
  const valid = isPlatformId(contract) && isPlatformId(id)
  const doc = useQuery({
    ...sdkQueries['documents.get'](net, { contractId: contract, type, id }),
    enabled: valid,
  })
  const contractQuery = useContract(net, contract)
  const data = doc.data?.data ?? null

  return (
    <PageFrame
      path="/document/$contract/$type/$id"
      title={t`Document`}
      eyebrow={t`Platform`}
      layer="platform"
      share
      lede={<span className="font-mono">{type}</span>}
      actions={
        <LinkOut
          to={{ app: 'pe', path: `/document/${id}`, net }}
        >{t`Open in Platform Explorer`}</LinkOut>
      }
    >
      {!valid ? (
        <Empty
          kind="not-found"
          title={t`That isn’t a document address.`}
          body={<Hash value={id} display="wrap" copy={false} />}
        />
      ) : (
        <SdkGate query={doc} skeleton={<Skeleton shape="block" height={220} />}>
          {!data || !doc.data ? (
            <Empty
              kind="not-found"
              title={t`No document with this ID in this type.`}
              body={
                <Link to="/contract/$id/documents/$type" params={{ id: contract, type }}>
                  {t`Browse the documents of this type`}
                </Link>
              }
            />
          ) : (
            <Loaded
              ctx={{
                net,
                contract,
                type,
                id,
                doc: data,
                stamp: stampOf(doc.data),
                keepsHistory: contractQuery.data?.data
                  ? typeKeepsHistory(contractQuery.data.data, type)
                  : false,
                page: search.page,
              }}
              tab={search.tab}
              knowsContract={!!contractQuery.data?.data}
            />
          )}
        </SdkGate>
      )}
    </PageFrame>
  )
}

function tabLink(ctx: DocumentContext, tab: DocumentTab): LinkProps {
  return {
    to: '/document/$contract/$type/$id',
    params: { contract: ctx.contract, type: ctx.type, id: ctx.id },
    search: (s: Record<string, unknown>) => ({
      ...s,
      tab: tab === 'data' ? undefined : tab,
      page: undefined,
    }),
  } as LinkProps
}

function Loaded({
  ctx,
  tab,
  knowsContract,
}: {
  ctx: DocumentContext
  tab: DocumentTab
  knowsContract: boolean
}) {
  const { t } = useLingui()
  const { doc } = ctx
  const tabs: { id: DocumentTab; label: string }[] = [
    { id: 'data', label: t`Data` },
    { id: 'meta', label: t`Metadata` },
    { id: 'revisions', label: t`Revisions` },
    { id: 'provenance', label: t`Provenance` },
  ]
  return (
    <>
      <Card title={t`Document`} layer="platform" source={ctx.stamp} id="document">
        <KeyValue
          columns={2}
          items={[
            { label: t`ID`, value: <Hash value={ctx.id} display="wrap" /> },
            { label: t`Type`, value: <span className="font-mono">{ctx.type}</span> },
            { label: t`Contract`, value: <Entity kind="contract" id={ctx.contract} /> },
            { label: t`Owner`, value: <IdentityRef id={doc.ownerId} /> },
            ...(doc.revision === null ? [] : [{ label: t`Revision`, value: String(doc.revision) }]),
          ]}
        />
      </Card>
      <div className="min-w-0">
        <Tabs
          tabs={tabs}
          value={tab}
          layer="platform"
          to={(next) => tabLink(ctx, next as DocumentTab)}
        />
      </div>
      {tab === 'data' ? (
        <Card title={t`Data`} layer="platform" source={ctx.stamp} id="data">
          <JsonView value={doc.data} collapsedDepth={2} label={t`Document data`} />
        </Card>
      ) : null}
      {tab === 'meta' ? <MetaTab ctx={ctx} /> : null}
      {tab === 'revisions' ? <RevisionsTab ctx={ctx} knowsContract={knowsContract} /> : null}
      {tab === 'provenance' ? <ProvenanceTab ctx={ctx} /> : null}
    </>
  )
}

function When({ at, height }: { at: number | null; height: number | null }) {
  const { t } = useLingui()
  if (at === null) return <Badge>{t`Never`}</Badge>
  return (
    <span className="flex flex-wrap items-center gap-2">
      <Time ms={at} mode="both" />
      {height !== null ? <span className="text-ink-2">{t`at block ${height}`}</span> : null}
    </span>
  )
}

function MetaTab({ ctx }: { ctx: DocumentContext }) {
  const { t } = useLingui()
  const { doc } = ctx
  return (
    <Card title={t`Metadata`} layer="platform" source={ctx.stamp} id="meta">
      <KeyValue
        columns={1}
        items={[
          { label: t`Revision`, value: doc.revision === null ? '—' : String(doc.revision) },
          {
            label: t`Created`,
            value: <When at={doc.createdAt} height={doc.createdAtBlockHeight} />,
          },
          {
            label: t`Updated`,
            value: <When at={doc.updatedAt} height={doc.updatedAtBlockHeight} />,
          },
          {
            label: t`Transferred`,
            value: <When at={doc.transferredAt} height={doc.transferredAtBlockHeight} />,
          },
          { label: t`Owner`, value: <IdentityRef id={doc.ownerId} /> },
        ]}
      />
    </Card>
  )
}
