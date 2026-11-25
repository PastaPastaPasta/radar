import { useLingui } from '@lingui/react/macro'
import { Link, useNavigate, type LinkProps } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo, useState, type FormEvent } from 'react'
import { peQueries } from '@/data/pe/queries'
import type { PeDataContract } from '@/data/pe/schemas'
import {
  Entity,
  IdentityRef,
  PageFrame,
  ScrollList,
  useIdentityNamesFailed,
  useNetwork,
  pagePosition,
} from '@/features/entity'
import { isPlatformId } from '@/lib/base58'
import { formatInt } from '@/lib/format'
import { isDevnet } from '@/lib/network'
import { wellKnownContracts } from '@/lib/well-known'
import {
  Badge,
  Card,
  DataTable,
  DateRangeFilter,
  Empty,
  Icon,
  RangeFilter,
  SegFilter,
  Time,
  Unavailable,
} from '@/ui'
import { usePeEnabled } from '../contract/contract-data'
import { usePeScroll } from '../pe-scroll'
import { peParams, rangeText, type ContractsSearch } from './contracts-query'

export interface ContractsPageProps {
  search: ContractsSearch
}

const patchLink = (patch: Partial<Record<string, unknown>>): LinkProps =>
  ({
    to: '/contracts',
    search: (s: Record<string, unknown>) => ({ ...s, ...patch }),
  }) as LinkProps

export function ContractsPage({ search }: ContractsPageProps) {
  const { t } = useLingui()
  const net = useNetwork()
  return (
    <PageFrame
      path="/contracts"
      title={t`Contracts`}
      eyebrow={t`Platform`}
      layer="platform"
      lede={t`Data contracts define what an application stores on Platform: document types, tokens and groups.`}
    >
      <Featured net={net} />
      <OpenById />
      <AllContracts search={search} />
    </PageFrame>
  )
}

function Featured({ net }: { net: ReturnType<typeof useNetwork> }) {
  const { t } = useLingui()
  const featured = wellKnownContracts(net)
  return (
    <Card title={t`Featured contracts`} layer="platform" id="featured">
      <ul className="grid gap-3 sm:grid-cols-3" data-featured>
        {featured.map((c) => (
          <li key={c.id} className="grid content-start gap-1" data-featured-contract={c.key}>
            <Link className="text-lg font-semibold" to="/contract/$id" params={{ id: c.id }}>
              {c.name}
            </Link>
            <p className="text-ink-2">{c.description}</p>
            <Entity kind="contract" id={c.id} label={c.id} />
          </li>
        ))}
      </ul>
    </Card>
  )
}

function OpenById() {
  const { t } = useLingui()
  const navigate = useNavigate()
  const [value, setValue] = useState('')
  const [error, setError] = useState(false)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const id = value.trim()
    if (!isPlatformId(id)) {
      setError(true)
      return
    }
    setError(false)
    void navigate({ to: '/contract/$id', params: { id } } as never)
  }
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={submit}
      aria-label={t`Open a contract`}
    >
      <label className="grid min-w-64 flex-1 gap-1">
        <span className="text-ink-2">{t`Open a contract by ID`}</span>
        <input
          className="dh-input font-mono"
          value={value}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={error || undefined}
          aria-describedby={error ? 'contract-id-error' : undefined}
          placeholder={t`A contract ID`}
          onChange={(e) => {
            setValue(e.target.value)
            setError(false)
          }}
        />
      </label>
      <button type="submit" className="dh-btn">
        {t`Open`}
      </button>
      {error ? (
        <p id="contract-id-error" role="alert" className="basis-full text-ink-2">
          {t`That isn’t a contract ID: it is up to 44 base58 characters.`}
        </p>
      ) : null}
    </form>
  )
}

function AllContracts({ search }: { search: ContractsSearch }) {
  const { t } = useLingui()
  const net = useNetwork()
  const enabled = usePeEnabled(net)
  return (
    <Card title={t`All contracts`} layer="platform" id="all">
      {isDevnet(net) ? (
        <Empty
          kind="unsupported-network"
          title={t`Platform Explorer doesn’t cover devnets.`}
          body={t`Open a contract by its ID above.`}
        />
      ) : !enabled ? (
        <Unavailable source="pe" title={t`The list of every contract needs Platform Explorer`} />
      ) : (
        <ContractTable search={search} net={net} />
      )}
    </Card>
  )
}

function ContractTable({
  search,
  net,
}: {
  search: ContractsSearch
  net: ReturnType<typeof useNetwork>
}) {
  const { t } = useLingui()
  const navigate = useNavigate()
  const { limit } = search
  const list = usePeScroll({
    listKey: JSON.stringify(peParams(search, 1, limit)),
    start: search.page,
    limit,
    page: (page) => peQueries.dataContracts(net, peParams(search, page, limit)),
    getRowId: (r: PeDataContract) => r.identifier,
  })
  const { rows } = list
  const namesFailed = useIdentityNamesFailed(
    rows.flatMap((r) => (r.owner?.identifier ? [r.owner.identifier] : [])),
  )

  const columns = useMemo<ColumnDef<PeDataContract>[]>(
    () => [
      {
        id: 'id',
        header: t`ID`,
        cell: ({ row }) => <Entity kind="contract" id={row.original.identifier} />,
        meta: { phone: 'title' },
      },
      {
        id: 'name',
        header: t`Name`,
        cell: ({ row }) => row.original.name ?? '—',
        meta: { phone: 'primary' },
      },
      {
        id: 'owner',
        header: t`Owner`,
        cell: ({ row }) => {
          const owner = row.original.owner?.identifier
          return owner ? <IdentityRef id={owner} /> : '—'
        },
        meta: { phone: 'secondary' },
      },
      {
        id: 'system',
        header: t`System`,
        cell: ({ row }) => (row.original.isSystem ? <Badge size="sm">{t`System`}</Badge> : '—'),
        meta: { phone: 'hidden' },
      },
      {
        id: 'tokens',
        header: t`Tokens`,
        cell: ({ row }) => formatInt(row.original.tokensCount ?? 0),
        meta: { numeric: true, phone: 'secondary' },
      },
      {
        id: 'docs',
        header: t`Documents`,
        accessorFn: (r) => r.documentsCount ?? 0,
        cell: ({ row }) => formatInt(row.original.documentsCount ?? 0),
        meta: { numeric: true, phone: 'secondary' },
      },
      {
        id: 'created',
        header: t`Time`,
        accessorFn: (r) => r.timestamp ?? 0,
        cell: ({ row }) =>
          row.original.timestamp == null ? (
            '—'
          ) : (
            <Time ms={row.original.timestamp} mode="relative" />
          ),
        meta: { phone: 'secondary' },
      },
    ],
    [t],
  )
  const change = (patch: Record<string, unknown>) => {
    void navigate({
      to: '/contracts',
      search: (s: Record<string, unknown>) => ({ ...s, page: undefined, ...patch }),
      replace: true,
    } as never)
  }
  const [ownerDraft, setOwnerDraft] = useState(search.owner ?? '')
  const filtered =
    search.owner !== undefined ||
    search.system === true ||
    search.tokens === true ||
    search.docs !== undefined ||
    search.from !== undefined ||
    search.to !== undefined

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end gap-3" data-contract-filters>
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            const owner = ownerDraft.trim()
            change({ owner: owner === '' ? undefined : owner })
          }}
        >
          <label className="grid gap-1">
            <span className="text-ink-2">{t`Owner`}</span>
            <input
              className="dh-input dh-input--sm font-mono"
              value={ownerDraft}
              placeholder={t`Identity ID`}
              spellCheck={false}
              autoComplete="off"
              onChange={(e) => {
                setOwnerDraft(e.target.value)
              }}
            />
          </label>
          <button type="submit" className="dh-btn dh-btn--sm">
            {t`Apply`}
          </button>
        </form>
        <SegFilter
          label={t`System contracts`}
          value={search.system === true ? 'only' : 'all'}
          onChange={(id) => {
            change({ system: id === 'only' ? 1 : undefined })
          }}
          options={[
            { id: 'all', label: t`All` },
            { id: 'only', label: t`System only` },
          ]}
        />
        <SegFilter
          label={t`Tokens`}
          value={search.tokens === true ? 'with' : 'all'}
          onChange={(id) => {
            change({ tokens: id === 'with' ? 1 : undefined })
          }}
          options={[
            { id: 'all', label: t`All` },
            { id: 'with', label: t`With tokens` },
          ]}
        />
        <RangeFilter
          label={t`Documents`}
          {...(search.docs === undefined ? {} : { value: rangeText(search.docs) ?? '' })}
          onChange={(value) => {
            change({ docs: value })
          }}
        />
        <DateRangeFilter
          label={t`Registered`}
          {...(search.from === undefined ? {} : { from: search.from })}
          {...(search.to === undefined ? {} : { to: search.to })}
          onChange={(range) => {
            change({ from: range.from, to: range.to })
          }}
        />
        {filtered ? (
          <Link
            className="dh-btn dh-btn--sm"
            {...patchLink({
              page: undefined,
              owner: undefined,
              system: undefined,
              tokens: undefined,
              docs: undefined,
              from: undefined,
              to: undefined,
            })}
          >
            {t`Clear filters`}
          </Link>
        ) : null}
      </div>
      <ScrollList chain={list} position={pagePosition}>
        <DataTable
          caption={t`Data contracts`}
          columns={columns}
          rows={rows}
          getRowId={list.getRowId}
          state={list.state}
          error={list.error}
          onRetry={list.onRetry}
          empty={<Empty kind="no-match" title={t`No contracts match.`} />}
          sort={{
            value: search.sort,
            onChange: (sort) => {
              change({ sort: sort === '-created' ? undefined : sort })
            },
          }}
          rowLink={(r) => ({ to: '/contract/$id', params: { id: r.identifier } }) as never}
          paging={list.paging}
          source={list.stamps.slice(0, 1)}
        />
      </ScrollList>
      {namesFailed ? (
        <p className="rx-errrow" data-names-unavailable>
          <Icon name="alert" />
          <span>{t`Owner names are unavailable: the Platform SDK didn’t answer.`}</span>
        </p>
      ) : null}
    </div>
  )
}
