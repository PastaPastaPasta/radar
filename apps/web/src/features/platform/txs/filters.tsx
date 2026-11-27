import { i18n } from '@lingui/core'
import { useLingui } from '@lingui/react/macro'
import { useMemo } from 'react'
import { rangeText } from '@/data/pe/blocks-query'
import { FILTER_TYPES } from '@/data/pe/transitions-query'
import type { NumericRange } from '@/lib/search-schemas'
import { BATCH_TYPES, type BatchType, type TransitionType } from '@/lib/tx-types'
import { DateRangeFilter, RangeFilter, SegFilter, TYPE_META, TypeBadge } from '@/ui'
import { MultiSelect, type MultiSelectOption } from './MultiSelect'

/** The filters Platform Explorer applies to a list of transitions, under neutral names. */
export interface TransitionFilters {
  type?: TransitionType[] | undefined
  batch?: string[] | undefined
  status?: 'success' | 'fail' | undefined
  gas?: NumericRange | undefined
  from?: string | undefined
  to?: string | undefined
}

export type TransitionFilterChange = Partial<Record<keyof TransitionFilters, unknown>>

export const NO_TRANSITION_FILTERS: TransitionFilterChange = {
  type: undefined,
  batch: undefined,
  status: undefined,
  gas: undefined,
  from: undefined,
  to: undefined,
}

const typeText = (type: TransitionType | BatchType) => i18n._(TYPE_META[type].label)

const typeOptions = (types: readonly (TransitionType | BatchType)[]): MultiSelectOption[] =>
  types.map((type) => ({
    id: type,
    text: typeText(type),
    node: <TypeBadge type={type} />,
  }))

/** Succeeded, failed or both. */
export function StatusFilter({
  value,
  onChange,
}: {
  value: TransitionFilters['status']
  onChange: (change: TransitionFilterChange) => void
}) {
  const { t } = useLingui()
  return (
    <SegFilter
      label={t`Status`}
      value={value ?? 'all'}
      onChange={(id) => {
        onChange({ status: id === 'all' ? undefined : id })
      }}
      options={[
        { id: 'all', label: t`All` },
        { id: 'success', label: t`Succeeded` },
        { id: 'fail', label: t`Failed` },
      ]}
    />
  )
}

/** Type, batch type, gas and date: the filters that sit in a list's filter panel. */
export function TransitionFilterFields({
  value,
  onChange,
}: {
  value: TransitionFilters
  onChange: (change: TransitionFilterChange) => void
}) {
  const { t } = useLingui()
  const batchOptions = useMemo(() => typeOptions(BATCH_TYPES), [])
  const typeChoices = useMemo(() => typeOptions(FILTER_TYPES), [])
  return (
    <>
      <MultiSelect
        label={t`Type`}
        options={typeChoices}
        value={value.type ?? []}
        onChange={(type) => {
          onChange({
            type: type.length > 0 ? type : undefined,
            ...(type.length > 0 && !(type.length === 1 && type[0] === 'batch')
              ? { batch: undefined }
              : {}),
          })
        }}
      />
      <MultiSelect
        label={t`Batch type`}
        options={batchOptions}
        value={value.batch ?? []}
        onChange={(batch) => {
          onChange({
            batch: batch.length > 0 ? batch : undefined,
            ...(batch.length > 0 ? { type: undefined } : {}),
          })
        }}
      />
      <RangeFilter
        label={t`Gas`}
        value={rangeText(value.gas)}
        onChange={(gas) => {
          onChange({ gas })
        }}
      />
      <div className="[&_input[type=date]]:w-[9.5rem]">
        <DateRangeFilter
          label={t`Date`}
          from={value.from}
          to={value.to}
          onChange={({ from, to }) => {
            onChange({ from, to })
          }}
        />
      </div>
    </>
  )
}

export interface FilterToken {
  id: string
  label: string
}

/** The active filters as removable tokens, with the change that removes each. */
export function useTransitionFilterTokens(value: TransitionFilters): {
  tokens: FilterToken[]
  removal: (id: string) => TransitionFilterChange
} {
  const { t } = useLingui()
  const types = value.type ?? []
  const batches = value.batch ?? []
  const tokens = [
    ...types.map((v) => ({ id: `type:${v}`, label: t`Type: ${typeText(v)}` })),
    ...batches.map((v) => ({
      id: `batch:${v}`,
      label: t`Batch: ${typeText(v as BatchType)}`,
    })),
    ...(value.status
      ? [{ id: 'status', label: value.status === 'fail' ? t`Failed only` : t`Succeeded only` }]
      : []),
    ...(value.gas ? [{ id: 'gas', label: t`Gas: ${rangeText(value.gas)}` }] : []),
    ...(value.from || value.to
      ? [{ id: 'date', label: t`Date: ${value.from ?? '…'} – ${value.to ?? '…'}` }]
      : []),
  ]
  const removal = (id: string): TransitionFilterChange => {
    const [kind, v] = id.split(':')
    if (kind === 'type') return { type: types.filter((x) => x !== v) }
    if (kind === 'batch') return { batch: batches.filter((x) => x !== v) }
    return id === 'date' ? { from: undefined, to: undefined } : { [id]: undefined }
  }
  return { tokens, removal }
}
