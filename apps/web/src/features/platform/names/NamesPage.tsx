import { useLingui } from '@lingui/react/macro'
import { useNavigate } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import { namesDocsArgs, NAMES_PAGE, normalizeLabel } from '@/data/query/prefetch/p-vote'
import type { DocumentDto } from '@/data/sdk/methods'
import { sdkQueries } from '@/data/sdk/queries'
import {
  chainStamps,
  Entity,
  IdentityRef,
  PageFrame,
  ScrollList,
  useNetwork,
  usePageChain,
  cursorPosition,
} from '@/features/entity'
import { Card, DataTable, Empty, Time } from '@/ui'
import { searchLink } from '../contest/shared'

export interface NamesPageSearch {
  q?: string | undefined
  after?: string | undefined
}

const labelOfDoc = (d: DocumentDto): string => {
  const { label, normalizedLabel } = d.data
  return typeof label === 'string'
    ? label
    : typeof normalizedLabel === 'string'
      ? normalizedLabel
      : ''
}

export function NamesPage({ search }: { search: NamesPageSearch }) {
  const { t } = useLingui()
  const net = useNetwork()
  const navigate = useNavigate()
  const q = (search.q ?? '').trim()
  const safe = normalizeLabel(q)
  const [draft, setDraft] = useState(search.q ?? '')
  const names = usePageChain({
    listKey: q,
    start: search.after,
    query: (after: string | undefined) =>
      sdkQueries['documents.query'](net, namesDocsArgs(q, after)),
    rows: (p) => p.data.slice(0, NAMES_PAGE),
    getRowId: (d) => d.id,
    next: (p) => (p.data.length > NAMES_PAGE ? p.data[NAMES_PAGE - 1]?.id : undefined),
  })

  const columns = useMemo<ColumnDef<DocumentDto>[]>(
    () => [
      {
        id: 'name',
        header: t`Name`,
        cell: ({ row }) => (
          <Entity
            kind="name"
            id={labelOfDoc(row.original)}
            label={`${labelOfDoc(row.original)}.dash`}
          />
        ),
        enableSorting: false,
        meta: { phone: 'title' },
      },
      {
        id: 'owner',
        header: t`Owner`,
        cell: ({ row }) => <IdentityRef id={row.original.ownerId} />,
        enableSorting: false,
        meta: { phone: 'primary' },
      },
      {
        id: 'created',
        header: t`Registered`,
        cell: ({ row }) =>
          row.original.createdAt ? <Time ms={row.original.createdAt} mode="absolute" /> : '—',
        enableSorting: false,
        meta: { phone: 'secondary' },
      },
    ],
    [t],
  )

  return (
    <PageFrame
      path="/names"
      title={t`Names`}
      eyebrow={t`Platform`}
      layer="platform"
      lede={t`Search DPNS names by prefix, or browse all of them alphabetically.`}
    >
      <form
        className="flex flex-wrap items-center gap-2"
        role="search"
        onSubmit={(e) => {
          e.preventDefault()
          void navigate(searchLink({ q: draft.trim() || undefined, after: undefined }) as never)
        }}
      >
        <label className="flex flex-wrap items-center gap-2">
          <span>{t`Name starts with`}</span>
          <input
            className="dh-input"
            type="search"
            value={draft}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => {
              setDraft(e.target.value)
            }}
          />
        </label>
        <button type="submit" className="dh-btn">
          {t`Search`}
        </button>
      </form>
      {q ? (
        <p className="rx-dim" data-searched>
          {safe === q.toLowerCase()
            ? t`Searching names that start with ${safe}.`
            : t`Searching the homograph-safe form ${safe}: DPNS stores o as 0, and i and l as 1.`}
        </p>
      ) : null}
      <Card layer="platform" id="names-list" source={chainStamps(names.pages)}>
        <ScrollList chain={names} position={cursorPosition('after')}>
          <DataTable
            caption={t`DPNS names`}
            columns={columns}
            rows={names.rows}
            getRowId={names.getRowId}
            rowLink={(d) => ({ to: '/name/$label', params: { label: labelOfDoc(d) } }) as never}
            state={names.state}
            error={names.error}
            onRetry={names.onRetry}
            paging={names.paging}
            empty={
              <Empty
                kind="no-match"
                title={q ? t`No name starts with ${safe}.` : t`No names yet.`}
              />
            }
          />
        </ScrollList>
      </Card>
    </PageFrame>
  )
}
