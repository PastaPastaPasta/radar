import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { Link, type LinkProps } from '@tanstack/react-router'
import { stampOf } from '@/data/envelope'
import { sdkQueries } from '@/data/sdk/queries'
import { Badge, Card, Empty, ErrorState, JsonView, Skeleton, SourceLine, Time } from '@/ui'
import type { DocumentContext } from './DocumentPage'

/** Platform answers at most this many revisions in one read. */
export const REVISION_PAGE = 10

function pageLink(ctx: DocumentContext, page: number): LinkProps {
  return {
    to: '/document/$contract/$type/$id',
    params: { contract: ctx.contract, type: ctx.type, id: ctx.id },
    search: (s: Record<string, unknown>) => ({
      ...s,
      tab: 'revisions',
      page: page <= 1 ? undefined : page,
    }),
  } as LinkProps
}

/**
 * Platform pages a document's history by time, not by offset, so page N starts after the last revision of page N-1:
 * each chunk reads its own page and hands its last time to the next one.
 */
function Chunk({ ctx, n, startAtMs }: { ctx: DocumentContext; n: number; startAtMs?: number }) {
  const { t } = useLingui()
  const query = useQuery(
    sdkQueries['documents.history'](ctx.net, {
      contractId: ctx.contract,
      type: ctx.type,
      id: ctx.id,
      limit: REVISION_PAGE,
      ...(startAtMs === undefined ? {} : { startAtMs }),
    }),
  )
  if (query.isPending) return <Skeleton shape="row" count={3} />
  if (query.isError && !query.data) {
    return (
      <ErrorState
        error={query.error}
        source="sdk"
        onRetry={() => {
          void query.refetch()
        }}
      />
    )
  }
  const rows = query.data?.data ?? []
  if (n < ctx.page) {
    const last = rows.at(-1)
    return last ? (
      <Chunk ctx={ctx} n={n + 1} startAtMs={last.atMs} />
    ) : (
      <Empty kind="none-yet" title={t`No more revisions.`} />
    )
  }
  const first = (n - 1) * REVISION_PAGE + 1
  return (
    <div className="grid gap-3" data-revisions-page={n}>
      {rows.length === 0 ? (
        <Empty
          kind="none-yet"
          title={n === 1 ? t`No revisions recorded.` : t`No more revisions.`}
          body={
            n > 1 ? (
              <Link {...pageLink(ctx, n - 1)}>{t`Back to the previous page`}</Link>
            ) : undefined
          }
        />
      ) : (
        <ol className="grid gap-3" start={first} aria-label={t`Revisions`}>
          {rows.map((r, i) => (
            <li
              key={r.atMs}
              className="grid gap-2 border-t border-line pt-3"
              data-revision={String(r.document.revision ?? first + i)}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="info">{t`Revision ${String(r.document.revision ?? first + i)}`}</Badge>
                <Time ms={r.atMs} mode="both" />
              </div>
              <JsonView
                value={r.document.data}
                collapsedDepth={1}
                label={t`Data at this revision`}
              />
            </li>
          ))}
        </ol>
      )}
      <nav aria-label={t`Revision pages`} className="flex items-center gap-2" data-revision-pager>
        {n > 1 ? (
          <Link className="dh-btn dh-btn--sm" {...pageLink(ctx, n - 1)}>
            {t`Previous`}
          </Link>
        ) : null}
        {rows.length === REVISION_PAGE ? (
          <Link className="dh-btn dh-btn--sm" {...pageLink(ctx, n + 1)}>
            {t`Next`}
          </Link>
        ) : null}
      </nav>
      {query.data ? <SourceLine stamp={stampOf(query.data)} /> : null}
    </div>
  )
}

export function RevisionsTab({
  ctx,
  knowsContract,
}: {
  ctx: DocumentContext
  knowsContract: boolean
}) {
  const { t } = useLingui()
  return (
    <Card title={t`Revisions`} layer="platform" source={ctx.stamp} id="revisions">
      {!ctx.keepsHistory ? (
        <Empty
          kind="none-yet"
          title={t`This document type doesn’t keep its history.`}
          body={
            knowsContract
              ? t`Platform stores only the latest revision of these documents.`
              : t`The contract couldn’t be read, so whether its history is kept isn’t known.`
          }
        />
      ) : (
        <Chunk ctx={ctx} n={1} />
      )}
    </Card>
  )
}
