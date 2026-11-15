import { plural } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'
import { sdkQueries } from '@/data/sdk/queries'
import { Card, Copy, DataTable, Empty, ErrorState, JsonView, Skeleton } from '@/ui'
import { isSourceError } from '@/data/errors'
import { formatInt } from '@/lib/format'
import type { NetworkId } from '@/lib/network'
import { bytesToHex } from '@/lib/hex'
import { download } from './download'
import { resultCsv, resultJson, resultRows } from './export'
import { decodeGroupKey } from './group-key'
import { QUERY_ERROR_HINTS } from './parse-messages'
import { buildSdkExample, classifyQueryError, formatAverage, toSdkParams } from './query-workspace'
import type { StatementRun } from './run'
import { typeHelp } from './schema'
import { toDocumentsQuery } from './sql-parser'

const MAX_COLUMNS = 7

/** A cell whose text may be one long unbroken ID: it wraps inside its card instead of running under the next field. */
const wrapped = ({ getValue }: { getValue: () => unknown }) => (
  <span className="[overflow-wrap:anywhere]">{String(getValue())}</span>
)

/** Whether the failure is Platform refusing or failing the query, rather than DAPI being out of reach. */
function isQueryProblem(error: unknown): boolean {
  if (!isSourceError(error)) return true
  return ![
    'network',
    'timeout',
    'rate-limited',
    'unavailable',
    'disabled-by-mode',
    'proof-failed',
  ].includes(error.kind)
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (value instanceof Uint8Array) return `0x${bytesToHex(value)}`
  const text = JSON.stringify(value, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v))
  return text.length > 80 ? `${text.slice(0, 79)}…` : text
}

/** The columns of a document list: the id and owner first, then the fields the rows share most. */
function columnsOf(rows: Record<string, unknown>[]): string[] {
  const counts = new Map<string, number>()
  for (const row of rows)
    for (const key of Object.keys(row)) counts.set(key, (counts.get(key) ?? 0) + 1)
  const lead = ['$id', '$ownerId'].filter((k) => counts.has(k))
  const rest = [...counts]
    .filter(([key]) => !lead.includes(key) && !key.startsWith('$'))
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => key)
  return [...lead, ...rest].slice(0, MAX_COLUMNS)
}

export interface ResultsPanelProps {
  run: StatementRun
  index: number
  net: NetworkId
  running: boolean
  onMore: (index: number) => void
}

export function ResultsPanel({ run, index, net, running, onMore }: ResultsPanelProps) {
  const { t, i18n } = useLingui()
  const { result, error } = run
  const rows = useMemo(() => (result ? resultRows(result) : []), [result])
  const contract = useQuery({
    ...sdkQueries['contracts.fetch'](net, { id: run.contractId }),
    enabled:
      result !== undefined && result.kind !== 'documents' && run.parsed.groupBy?.length === 1,
  })
  const groupType = useMemo(() => {
    const field = run.parsed.groupBy?.length === 1 ? run.parsed.groupBy[0] : undefined
    const data = contract.data?.data
    if (!field || !data) return undefined
    const type = typeHelp(data).find((entry) => entry.name === run.parsed.from)
    return type?.fields.find((f) => f.name === field)?.type
  }, [contract.data, run.parsed.groupBy, run.parsed.from])
  const columns = useMemo<ColumnDef<Record<string, unknown>>[]>(() => {
    if (!result) return []
    if (result.kind === 'documents') {
      return columnsOf(rows).map((key, i) => ({
        id: key,
        header: key,
        accessorFn: (row) => cellText(row[key]),
        cell: wrapped,
        ...(i === 0 ? { meta: { phone: 'title' as const } } : {}),
      }))
    }
    const columnsFor: [string, string][] =
      result.kind === 'avg'
        ? [
            ['groupKey', t`Group`],
            ['count', t`Documents`],
            ['sum', t`Sum`],
            ['average', t`Average`],
          ]
        : [
            ['groupKey', t`Group`],
            result.kind === 'count' ? ['count', t`Documents`] : ['sum', t`Sum`],
          ]
    return columnsFor.map(([key, header], i) => ({
      id: key,
      header,
      accessorFn: (row) => {
        const cell = row[key]
        if (key === 'groupKey') {
          return cell === '' ? t`All documents` : decodeGroupKey(cellText(cell), groupType)
        }
        return typeof cell === 'bigint' || typeof cell === 'number'
          ? formatInt(cell)
          : cellText(cell)
      },
      cell: wrapped,
      meta: {
        ...(i === 0 ? { phone: 'title' as const } : {}),
        numeric: i > 0,
        align: i > 0 ? 'end' : 'start',
      },
    }))
  }, [result, rows, groupType, t])

  const sdkExample = useMemo(() => {
    const { groupBy, ...args } = toDocumentsQuery(run.parsed, run.contractId)
    try {
      return buildSdkExample(
        run.parsed,
        toSdkParams({ ...args, ...(groupBy ? { groupBy } : {}) }),
        net,
        true,
      )
    } catch {
      return undefined
    }
  }, [run.parsed, run.contractId, net])

  const title = (
    <span className="rx-mono break-words text-[length:var(--dh-fs-sm)]" data-statement={index + 1}>
      {run.sql}
    </span>
  )

  if (error) {
    const kind = classifyQueryError(error instanceof Error ? error.message : undefined)
    const hint = kind ? QUERY_ERROR_HINTS[kind] : undefined
    const cancelled = run.cancelled === true || (isSourceError(error) && error.kind === 'aborted')
    return (
      <Card title={title} layer="platform">
        {cancelled ? (
          <Empty
            kind="none-yet"
            title={t`Cancelled`}
            body={t`This statement was stopped before it answered.`}
          />
        ) : (
          <div className="grid gap-2">
            {isQueryProblem(error) ? (
              <div role="alert" data-query-problem="run" className="grid gap-1">
                <p className="font-semibold">{t`Platform couldn't run this query`}</p>
                <p className="rx-mono break-words text-sm">
                  {error instanceof Error
                    ? error.message
                    : typeof error === 'string'
                      ? error
                      : null}
                </p>
              </div>
            ) : (
              <ErrorState error={error} source="sdk" />
            )}
            {hint ? (
              <p className="text-sm" data-query-hint>
                {i18n._(hint)}
              </p>
            ) : null}
          </div>
        )}
      </Card>
    )
  }
  if (!result) {
    return (
      <Card title={title} layer="platform" state="loading">
        <Skeleton shape="row" count={3} />
      </Card>
    )
  }

  const name = `radar-query-${index + 1}`
  return (
    <Card
      title={title}
      layer="platform"
      source={result.stamp}
      actions={
        <div className="flex flex-wrap items-center gap-2" data-export>
          <button
            type="button"
            className="dh-btn dh-btn--sm"
            disabled={rows.length === 0}
            onClick={() => {
              download(`${name}.json`, resultJson(result), 'application/json')
            }}
          >
            {t`Export JSON`}
          </button>
          <button
            type="button"
            className="dh-btn dh-btn--sm"
            disabled={rows.length === 0}
            onClick={() => {
              download(`${name}.csv`, resultCsv(result), 'text/csv')
            }}
          >
            {t`Export CSV`}
          </button>
        </div>
      }
    >
      <div className="grid gap-3" data-result-kind={result.kind}>
        <p className="text-sm text-[var(--dh-ink-2)]" data-result-count>
          {result.kind === 'documents'
            ? plural(result.rows.length, { one: '# document', other: '# documents' })
            : result.kind === 'count'
              ? plural(result.groups.length, { one: '# group', other: '# groups' })
              : result.kind === 'sum'
                ? t`Sum of ${result.field}`
                : t`Average of ${result.field}`}
        </p>
        <DataTable
          columns={columns}
          rows={rows}
          getRowId={(row) => String(rows.indexOf(row))}
          state="ready"
          caption={t`Result of statement ${index + 1}`}
          empty={
            <Empty
              kind="no-match"
              title={t`No documents match.`}
              body={t`The query ran and Platform answered with nothing, proof included.`}
            />
          }
        />
        {result.kind === 'documents' && result.more ? (
          <div>
            <button
              type="button"
              className="dh-btn dh-btn--sm"
              disabled={running}
              onClick={() => {
                onMore(index)
              }}
            >
              {t`Load the next page`}
            </button>
          </div>
        ) : null}
        {result.kind === 'avg' ? (
          <p className="sr-only">
            {result.groups
              .map((g) => `${g.key || t`All documents`}: ${formatAverage(g.sum, g.count)}`)
              .join('; ')}
          </p>
        ) : null}
        <details>
          <summary className="cursor-pointer">{t`Raw result`}</summary>
          <JsonView value={rows} collapsedDepth={1} label={t`Raw result`} />
        </details>
        {sdkExample ? (
          <details data-sdk-example>
            <summary className="cursor-pointer">{t`SDK example`}</summary>
            <div className="mt-2 flex items-start gap-2">
              <pre className="rx-mono min-w-0 flex-1 overflow-auto rounded-[var(--dh-r2)] bg-[var(--dh-sunken)] p-3 text-[length:var(--dh-fs-sm)]">
                {sdkExample}
              </pre>
              <Copy value={sdkExample} label={t`Copy the SDK example`} />
            </div>
          </details>
        ) : null}
      </div>
    </Card>
  )
}
