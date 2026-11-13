import { useLingui } from '@lingui/react/macro'
import { useMemo, useState, type FormEvent } from 'react'
import type { WhereClause, WhereOp } from '@/lib/search-schemas'
import { Badge } from '@/ui'
import {
  ALL_OPS,
  fieldType,
  indexedFields,
  OP_SYMBOL,
  opsAt,
  orderDirection,
  orderField,
  servingIndex,
  validateQuery,
  type FilterIndex,
} from './doc-filters'
import { problemText } from './problem-text'

export interface FilterValues {
  where: WhereClause[]
  order: string[]
  limit: number
}

export interface DocFiltersProps {
  indices: FilterIndex[]
  schema: Record<string, unknown> | undefined
  initial: FilterValues
  limits: readonly number[]
  onRun: (values: FilterValues) => void
  onClear: () => void
}

interface Draft {
  field: string
  op: WhereOp
  /** What the box holds; an `in` clause is several values separated by commas, bars or spaces. */
  text: string
}

const toDraft = (c: WhereClause): Draft => ({
  field: c.field,
  op: c.op,
  text: Array.isArray(c.value) ? c.value.join(', ') : c.value,
})

const splitValues = (text: string): string[] =>
  text
    .split(/[\s,|]+/)
    .map((v) => v.trim())
    .filter((v) => v !== '')

const toClause = (d: Draft): WhereClause => ({
  field: d.field,
  op: d.op,
  value: d.op === 'in' ? splitValues(d.text) : d.text.trim(),
})

const opLabel = (op: WhereOp, startsWith: string) => (op === 'sw' ? startsWith : OP_SYMBOL[op])

/**
 * The filter form: it offers the properties of the type's indices in their order, and for each only the operators
 * Platform accepts there. A filter that Platform would refuse is explained here, and cannot be run.
 */
export function DocFilters({ indices, schema, initial, limits, onRun, onClear }: DocFiltersProps) {
  const { t, i18n } = useLingui()
  const [drafts, setDrafts] = useState<Draft[]>(initial.where.map(toDraft))
  const [orderItem, setOrderItem] = useState(initial.order[0] ?? '')
  const [limit, setLimit] = useState(initial.limit)
  const [pinned, setPinned] = useState<string>('')
  const startsWith = t`starts with`

  const clauses = useMemo(() => drafts.map(toClause), [drafts])
  const order = useMemo(() => (orderItem === '' ? [] : [orderItem]), [orderItem])
  const problems = useMemo(
    () => validateQuery(clauses, order, indices, schema),
    [clauses, order, indices, schema],
  )
  const chosen =
    indices.find((i) => i.name === pinned) ??
    servingIndex(clauses, order, indices) ??
    indices.find((i) => clauses.every((c) => i.properties.some((p) => p.field === c.field))) ??
    indices[0]
  const fields =
    pinned === '' ? indexedFields(indices) : (chosen?.properties.map((p) => p.field) ?? [])
  const unused = fields.filter((f) => !drafts.some((d) => d.field === f))
  const orderFields = chosen?.properties.map((p) => p.field) ?? []

  const update = (i: number, patch: Partial<Draft>) => {
    setDrafts((all) => all.map((d, j) => (j === i ? { ...d, ...patch } : d)))
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (problems.length > 0) return
    onRun({ where: clauses.filter((c) => c.field !== ''), order, limit })
  }

  return (
    <form
      className="grid gap-3"
      onSubmit={submit}
      aria-label={t`Filter documents`}
      data-doc-filters
    >
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1">
          <span className="text-ink-2">{t`Index`}</span>
          <select
            className="dh-select dh-select--sm"
            value={pinned}
            onChange={(e) => {
              setPinned(e.target.value)
            }}
          >
            <option value="">{t`Any index`}</option>
            {indices.map((i) => (
              <option key={i.name} value={i.name}>
                {i.implicit
                  ? t`Primary key ($id)`
                  : `${i.name} (${i.properties.map((p) => p.field).join(', ')})`}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-ink-2">{t`Order by`}</span>
          <select
            className="dh-select dh-select--sm"
            value={orderItem}
            onChange={(e) => {
              setOrderItem(e.target.value)
            }}
          >
            <option value="">{t`Default`}</option>
            {orderFields.flatMap((f) => [
              <option key={f} value={f}>
                {t`${f}, ascending`}
              </option>,
              <option key={`-${f}`} value={`-${f}`}>
                {t`${f}, descending`}
              </option>,
            ])}
            {orderItem !== '' && !orderFields.includes(orderField(orderItem)) ? (
              <option value={orderItem}>
                {orderDirection(orderItem) === 'desc'
                  ? t`${orderField(orderItem)}, descending`
                  : t`${orderField(orderItem)}, ascending`}
              </option>
            ) : null}
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-ink-2">{t`Rows per page`}</span>
          <select
            className="dh-select dh-select--sm"
            value={limit}
            onChange={(e) => {
              setLimit(Number(e.target.value))
            }}
          >
            {limits.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>

      {drafts.length === 0 ? (
        <p className="text-ink-2">{t`No filter: the first documents of this type are listed.`}</p>
      ) : (
        <ul className="grid gap-2" aria-label={t`Filters`}>
          {drafts.map((d, i) => {
            const type = fieldType(schema, d.field)
            const offered = chosen ? opsAt(chosen, d.field, type, clauses) : ([] as WhereOp[])
            const ops = offered.includes(d.op) ? offered : [...offered, d.op]
            const fieldOptions = [...new Set([d.field, ...fields])]
            return (
              <li key={i} className="flex flex-wrap items-center gap-2" data-clause={i}>
                <select
                  className="dh-select dh-select--sm font-mono"
                  aria-label={t`Property`}
                  value={d.field}
                  onChange={(e) => {
                    update(i, { field: e.target.value })
                  }}
                >
                  {fieldOptions.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
                <select
                  className="dh-select dh-select--sm"
                  aria-label={t`Operator`}
                  value={d.op}
                  onChange={(e) => {
                    update(i, { op: e.target.value as WhereOp })
                  }}
                >
                  {ALL_OPS.filter((op) => ops.includes(op)).map((op) => (
                    <option key={op} value={op}>
                      {opLabel(op, startsWith)}
                    </option>
                  ))}
                </select>
                <input
                  className="dh-input dh-input--sm min-w-48 flex-1 font-mono"
                  aria-label={d.op === 'in' ? t`Values, separated by commas` : t`Value`}
                  placeholder={d.op === 'in' ? t`a, b, c` : t`value`}
                  value={d.text}
                  spellCheck={false}
                  autoComplete="off"
                  onChange={(e) => {
                    update(i, { text: e.target.value })
                  }}
                />
                <button
                  type="button"
                  className="dh-btn dh-btn--sm"
                  onClick={() => {
                    setDrafts((all) => all.filter((_, j) => j !== i))
                  }}
                >
                  {t`Remove filter`}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {problems.length > 0 ? (
        <ul className="grid gap-1" role="alert" data-filter-problems>
          {problems.map((p, i) => (
            <li key={i} className="flex items-start gap-2" data-rule={p.rule}>
              <Badge tone="danger" size="sm">
                {t`Won’t run`}
              </Badge>
              <span>{problemText(i18n, p)}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="dh-btn dh-btn--sm"
          disabled={unused.length === 0}
          onClick={() => {
            const field = unused[0]
            if (field === undefined) return
            const type = fieldType(schema, field)
            const first = chosen ? opsAt(chosen, field, type, clauses)[0] : 'eq'
            setDrafts((all) => [...all, { field, op: first ?? 'eq', text: '' }])
          }}
        >
          {t`Add a filter`}
        </button>
        <button
          type="submit"
          className="dh-btn dh-btn--primary dh-btn--sm"
          disabled={problems.length > 0}
        >
          {t`Run query`}
        </button>
        <button
          type="button"
          className="dh-btn dh-btn--sm"
          onClick={() => {
            setDrafts([])
            setOrderItem('')
            onClear()
          }}
        >
          {t`Clear`}
        </button>
      </div>
    </form>
  )
}
