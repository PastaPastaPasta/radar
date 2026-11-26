import { useLingui } from '@lingui/react/macro'
import { sdkQueries } from '@/data/sdk/queries'
import { chainStamps, ScrollList, usePageChain, cursorPosition } from '@/features/entity'
import { Badge, Card, Empty, ErrorState, JsonView, Pager, Skeleton, SourceLine, Time } from '@/ui'
import type { DocumentContext } from './DocumentPage'

/** Platform answers at most this many revisions in one read. */
const REVISION_PAGE = 10

/**
 * Platform pages a document's history by time, not by offset, so each page starts after the last revision of the one
 * before; `from` in the address is that time for the first page shown.
 */
function Revisions({ ctx }: { ctx: DocumentContext }) {
  const { t } = useLingui()
  const list = usePageChain({
    listKey: [ctx.contract, ctx.type, ctx.id].join('\u0000'),
    start: ctx.from,
    query: (startAtMs: number | undefined) =>
      sdkQueries['documents.history'](ctx.net, {
        contractId: ctx.contract,
        type: ctx.type,
        id: ctx.id,
        limit: REVISION_PAGE,
        ...(startAtMs === undefined ? {} : { startAtMs }),
      }),
    rows: (p) => p.data,
    getRowId: (r) => String(r.atMs),
    next: (p) => {
      const last = p.data.at(-1)?.atMs
      return p.data.length === REVISION_PAGE && last !== undefined ? last + 1 : undefined
    },
  })
  const stamps = chainStamps(list.pages)
  // From the top of the history a revision without a number is numbered by its place; part-way down that is unknown.
  const fromTop = list.pages[0]?.param === undefined && !list.before.has
  return (
    <ScrollList chain={list} position={cursorPosition('from')}>
      {list.state === 'loading' ? (
        <Skeleton shape="row" count={3} />
      ) : list.state === 'error' ? (
        <ErrorState error={list.error} source="sdk" onRetry={list.onRetry} />
      ) : list.state === 'empty' ? (
        <Empty
          kind="none-yet"
          title={fromTop ? t`No revisions recorded.` : t`No more revisions.`}
        />
      ) : (
        <div className="grid gap-3">
          <ol className="grid gap-3" aria-label={t`Revisions`}>
            {list.rows.map((r, i) => {
              const number = String(r.document.revision ?? (fromTop ? i + 1 : '—'))
              return (
                <li
                  key={r.atMs}
                  className="grid gap-2 border-t border-line pt-3"
                  data-row-id={String(r.atMs)}
                  data-revision={number}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="info">{t`Revision ${number}`}</Badge>
                    <Time ms={r.atMs} mode="both" />
                  </div>
                  <JsonView
                    value={r.document.data}
                    collapsedDepth={1}
                    label={t`Data at this revision`}
                  />
                </li>
              )
            })}
          </ol>
          <div className="rx-tfoot">
            <Pager
              paging={list.paging}
              shown={list.rows.length}
              last={list.rows.at(-1)?.atMs.toString()}
            />
          </div>
          {stamps.length > 0 ? <SourceLine stamp={stamps} /> : null}
        </div>
      )}
    </ScrollList>
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
        <Revisions ctx={ctx} />
      )}
    </Card>
  )
}
