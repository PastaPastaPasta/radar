import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import { stampOf } from '@/data/envelope'
import { namesDocsArgs, NAMES_PAGE, normalizeLabel } from '@/data/query/prefetch/p-vote'
import type { DocumentDto } from '@/data/sdk/methods'
import { sdkQueries } from '@/data/sdk/queries'
import { Entity, IdentityRef, PageFrame, useNetwork } from '@/features/entity'
import { Card, DataTable, Empty, Time } from '@/ui'
import { searchLink } from '../contest/shared'
import { loadState } from '../identity/common'

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
  const names = useQuery(sdkQueries['documents.query'](net, namesDocsArgs(q, search.after)))
  const all = names.data?.data ?? []
  const rows = all.slice(0, NAMES_PAGE)
  const hasNext = all.length > NAMES_PAGE
  const last = rows[rows.length - 1]

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
      <Card layer="platform" id="names-list" source={names.data ? stampOf(names.data) : undefined}>
        <DataTable
          caption={t`DPNS names`}
          columns={columns}
          rows={rows}
          getRowId={(d) => d.id}
          rowLink={(d) => ({ to: '/name/$label', params: { label: labelOfDoc(d) } }) as never}
          state={loadState(names)}
          error={names.error}
          onRetry={() => void names.refetch()}
          paging={{
            kind: 'cursor',
            ...(hasNext && last ? { next: searchLink({ after: last.id }) } : {}),
            ...(search.after ? { prev: searchLink({ after: undefined }) } : {}),
          }}
          empty={
            <Empty kind="no-match" title={q ? t`No name starts with ${safe}.` : t`No names yet.`} />
          }
        />
      </Card>
    </PageFrame>
  )
}
