import { plural } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import { Link, useNavigate, type LinkProps } from '@tanstack/react-router'
import { useQueries } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import { stampOf, type SourceStamp } from '@/data/envelope'
import { sdkQueries } from '@/data/sdk/queries'
import type { ContractFullDto } from '@/data/sdk/methods'
import type { ContractVersionDto } from '@/data/sdk/methods/p-data'
import { formatInt } from '@/lib/format'
import { Badge, Card, DataTable, Empty, Skeleton, Time } from '@/ui'
import type { ContractContext } from './contract-context'
import { schemaLink } from './SchemaTab'
import { diffJson, pointerOf, type Change } from './version-diff'

/** Platform answers at most this many versions in one read. */
const HISTORY_CHUNK = 10
const MAX_CHANGES = 200

/** What a version consists of, for comparing two of them. */
function comparable(contract: ContractFullDto): Record<string, unknown> {
  return {
    documentSchemas: contract.documentSchemas,
    config: contract.config,
    tokens: Object.fromEntries(contract.tokens.map((tk) => [String(tk.position), tk.config])),
    groups: Object.fromEntries(contract.groups.map((g) => [String(g.position), g])),
  }
}

function short(value: unknown): string {
  const text = JSON.stringify(value) ?? 'undefined'
  return text.length > 140 ? `${text.slice(0, 137)}…` : text
}

function versionLink(version: number, base?: number): LinkProps {
  return {
    to: '/contract/$id',
    search: (s: Record<string, unknown>) => ({ ...s, tab: 'history', rev: version, base }),
  } as LinkProps
}

function ChangeRow({ id, change, atRev }: { id: string; change: Change; atRev: boolean }) {
  const { t } = useLingui()
  const [root, ...rest] = change.path
  const label = { added: t`Added`, removed: t`Removed`, changed: t`Changed` }[change.kind]
  const tone =
    change.kind === 'added' ? 'success' : change.kind === 'removed' ? 'danger' : 'warning'
  const where = pointerOf(change.path)
  return (
    <li className="grid gap-1 border-t border-line py-2" data-change={change.kind}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge size="sm" tone={tone}>
          {label}
        </Badge>
        {root === 'documentSchemas' && atRev && change.kind !== 'removed' ? (
          <Link className="font-mono" {...schemaLink(id, rest)}>
            {where}
          </Link>
        ) : (
          <span className="font-mono">{where}</span>
        )}
      </div>
      {change.kind !== 'added' ? (
        <code className="block break-all text-ink-2">− {short(change.before)}</code>
      ) : null}
      {change.kind !== 'removed' ? (
        <code className="block break-all">+ {short(change.after)}</code>
      ) : null}
    </li>
  )
}

function Diff({ ctx, versions }: { ctx: ContractContext; versions: ContractVersionDto[] }) {
  const { t } = useLingui()
  const navigate = useNavigate()
  const { id, search } = ctx
  const to = versions.find((v) => v.contract.version === search.rev)
  const index = to ? versions.indexOf(to) : -1
  const from =
    search.base !== undefined
      ? versions.find((v) => v.contract.version === search.base)
      : versions[index - 1]
  if (!to) return null
  const toVersion = to.contract.version
  if (!from) {
    return (
      <p role="status" className="text-ink-2" data-diff-empty>
        {t`Version ${toVersion} is the first one recorded, so there is nothing before it to compare with.`}
      </p>
    )
  }
  const changes = diffJson(comparable(from.contract), comparable(to.contract))
  const changeCount = changes.length
  const fromVersion = from.contract.version
  return (
    <section className="grid gap-3" aria-label={t`Changes`} data-diff>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-lg font-semibold">{t`Version ${fromVersion} to version ${toVersion}`}</h4>
        <label className="inline-flex items-center gap-2 text-ink-2">
          {t`Compare with`}
          <select
            className="dh-select dh-select--sm"
            value={from.contract.version}
            onChange={(e) => {
              void navigate({
                to: '.',
                search: (s: Record<string, unknown>) => ({ ...s, base: Number(e.target.value) }),
                replace: true,
              } as never)
            }}
          >
            {versions
              .filter((v) => v !== to)
              .map((v) => {
                const version = v.contract.version
                return (
                  <option key={version} value={version}>
                    {t`Version ${version}`}
                  </option>
                )
              })}
          </select>
        </label>
      </div>
      {changes.length === 0 ? (
        <p role="status" className="text-ink-2" data-diff-none>
          {t`These two versions are the same.`}
        </p>
      ) : (
        <>
          <p className="text-ink-2">
            {plural(changeCount, { one: '# change', other: '# changes' })}
          </p>
          <ul>
            {changes.slice(0, MAX_CHANGES).map((c) => (
              <ChangeRow
                key={pointerOf(c.path)}
                id={id}
                change={c}
                atRev={toVersion === ctx.contract.version}
              />
            ))}
          </ul>
          {changes.length > MAX_CHANGES ? (
            <p className="text-ink-2">{t`Showing the first ${MAX_CHANGES}.`}</p>
          ) : null}
        </>
      )}
    </section>
  )
}

function Versions({ ctx }: { ctx: ContractContext }) {
  const { t } = useLingui()
  const { net, id, search } = ctx
  const [cursors, setCursors] = useState<(number | undefined)[]>([undefined])
  const queries = useQueries({
    queries: cursors.map((startAtMs) =>
      sdkQueries['contracts.getHistory'](net, {
        id,
        limit: HISTORY_CHUNK,
        ...(startAtMs === undefined ? {} : { startAtMs }),
      }),
    ),
  })
  const versions = queries.flatMap((q) => q.data?.data ?? [])
  const last = queries.at(-1)
  const lastChunk = last?.data?.data ?? []
  const more = lastChunk.length === HISTORY_CHUNK
  const missing = [search.rev, search.base].some(
    (v) => v !== undefined && !versions.some((x) => x.contract.version === v),
  )
  const settled = last?.isSuccess === true
  const next = lastChunk.length === 0 ? undefined : lastChunk[lastChunk.length - 1]!.atMs + 1
  if (missing && more && settled && next !== undefined && !cursors.includes(next)) {
    setCursors([...cursors, next])
  }

  const stamps: SourceStamp[] = [
    ctx.stamp,
    ...queries.flatMap((q) => (q.data ? [stampOf(q.data)] : [])),
  ]
  const failed = queries.find((q) => q.isError && !q.data)
  const wantedVersion = search.rev
  const currentVersion = ctx.contract.version
  const columns = useMemo<ColumnDef<ContractVersionDto>[]>(
    () => [
      {
        id: 'version',
        header: t`Version`,
        cell: ({ row }) => {
          const version = row.original.contract.version
          return (
            <span className="inline-flex items-center gap-2">
              {version}
              {version === currentVersion ? (
                <Badge size="sm" tone="info">
                  {t`Current`}
                </Badge>
              ) : null}
            </span>
          )
        },
        meta: { numeric: true, phone: 'title' },
      },
      {
        id: 'recorded',
        header: t`Recorded`,
        cell: ({ row }) => <Time ms={row.original.atMs} mode="both" />,
        meta: { phone: 'primary' },
      },
      {
        id: 'types',
        header: t`Document types`,
        cell: ({ row }) => formatInt(Object.keys(row.original.contract.documentSchemas).length),
        meta: { numeric: true, phone: 'secondary' },
      },
      {
        id: 'compare',
        header: t`Compare`,
        cell: ({ row }) => (
          <Link className="dh-btn dh-btn--sm" {...versionLink(row.original.contract.version)}>
            {t`See changes`}
          </Link>
        ),
      },
    ],
    [t, currentVersion],
  )
  return (
    <Card
      title={t`Version history`}
      layer="platform"
      source={stamps}
      id="history"
      state={queries[0]?.isPending ? 'loading' : failed ? 'error' : 'ready'}
      error={failed?.error}
      onRetry={() => {
        void failed?.refetch()
      }}
    >
      {queries[0]?.isPending ? (
        <Skeleton shape="row" count={3} />
      ) : (
        <div className="grid gap-4">
          <DataTable
            caption={t`Versions of this contract`}
            columns={columns}
            rows={versions}
            getRowId={(v) => String(v.atMs)}
            state="ready"
          />
          {more ? (
            <button
              type="button"
              className="dh-btn dh-btn--sm justify-self-start"
              disabled={!settled}
              onClick={() => {
                setCursors((c) => [...c, lastChunk[lastChunk.length - 1]!.atMs + 1])
              }}
            >
              {t`Load older versions`}
            </button>
          ) : null}
          {wantedVersion === undefined ? (
            <p className="text-ink-2">{t`Choose a version to see what it changed.`}</p>
          ) : missing && more ? (
            <Skeleton shape="block" />
          ) : versions.some((v) => v.contract.version === search.rev) ? (
            <Diff ctx={ctx} versions={versions} />
          ) : (
            <Empty
              kind="not-found"
              title={t`This contract has no version ${wantedVersion}.`}
              body={
                <Link {...versionLink(ctx.contract.version)}>{t`Open the current version`}</Link>
              }
            />
          )}
        </div>
      )}
    </Card>
  )
}

export function HistoryTab({ ctx }: { ctx: ContractContext }) {
  const { t } = useLingui()
  const currentVersion = ctx.contract.version
  if (!ctx.contract.keepsHistory) {
    return (
      <Card title={t`Version history`} layer="platform" source={ctx.stamp} id="history">
        <Empty
          kind="none-yet"
          title={t`This contract doesn’t keep its history.`}
          body={t`Platform stores only its current version, ${currentVersion}. A contract that sets keepsHistory keeps every version.`}
        />
      </Card>
    )
  }
  return <Versions ctx={ctx} />
}
