import { plural } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import { useQueries } from '@tanstack/react-query'
import { useId, useRef, useState } from 'react'
import { peQueries } from '@/data/pe/queries'
import { useNetwork } from '@/features/entity'
import { isPlatformId } from '@/lib/base58'
import { formatInt } from '@/lib/format'
import type { NetworkId } from '@/lib/network'
import { wellKnownLabel } from '@/lib/well-known'
import { contractName } from '../contract/contract-data'
import { useUsedContracts } from './tx-filters'

/** As many reads as the edge answers in one batch: the names cost one request. */
const NAMED_AT_ONCE = 16

export const shortId = (id: string) => `${id.slice(0, 6)}…${id.slice(-4)}`

/** A name for each contract: Radar's own for the well-known ones, else Platform Explorer's when it has one. */
export function useContractNames(net: NetworkId, ids: readonly string[], enabled: boolean) {
  const asked = [...new Set(ids)]
    .filter((id) => isPlatformId(id) && wellKnownLabel(net, 'contract', id) === undefined)
    .slice(0, NAMED_AT_ONCE)
  const reads = useQueries({
    queries: asked.map((id) => ({ ...peQueries.dataContract(net, id), enabled })),
  })
  const peName = new Map(asked.map((id, i) => [id, reads[i]?.data?.data?.name]))
  return (id: string) => contractName(net, id, peName.get(id))
}

/**
 * The contract filter: the contracts this identity's transitions act on, read when the picker opens, or a pasted
 * contract id.
 */
export function ContractFilter({
  id,
  value,
  onChange,
}: {
  id: string
  value: string | undefined
  onChange: (contract: string | undefined) => void
}) {
  const { t } = useLingui()
  const net = useNetwork()
  const inputId = useId()
  const ref = useRef<HTMLDetailsElement>(null)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string>()
  const used = useUsedContracts(net, id, open)
  const nameOf = useContractNames(
    net,
    used.contracts.map((c) => c.id),
    open,
  )
  const choose = (contract: string | undefined) => {
    onChange(contract)
    setDraft('')
    setError(undefined)
    if (ref.current) ref.current.open = false
  }
  const paste = () => {
    const text = draft.trim()
    if (text === '') return
    if (!isPlatformId(text)) {
      setError(t`That isn’t a contract ID: it is 43 or 44 base58 characters.`)
      return
    }
    choose(text)
  }
  const options = value && !used.contracts.some((c) => c.id === value) ? [value] : []

  return (
    <details
      ref={ref}
      className="relative max-sm:open:basis-full"
      data-contract-filter
      onToggle={(e) => {
        setOpen(e.currentTarget.open)
      }}
    >
      <summary
        className={`rx-filter${value ? ' is-on' : ''}`}
        style={{ cursor: 'pointer', listStyle: 'none' }}
      >
        {t`Contract`}
        {value ? <span className="rx-count"> 1</span> : null}
      </summary>
      <div className="mt-1 grid gap-2 rounded-2 border border-line-2 bg-surface p-2 sm:absolute sm:z-20 sm:w-[24rem] sm:shadow-pop">
        <fieldset className="m-0 grid max-h-72 gap-1 overflow-auto border-0 p-0">
          <legend className="dh-sr">{t`Contract`}</legend>
          <ContractOption
            checked={value === undefined}
            onSelect={() => {
              choose(undefined)
            }}
            title={t`All contracts`}
          />
          {options.map((c) => (
            <ContractOption
              key={c}
              checked
              onSelect={() => {
                choose(c)
              }}
              title={nameOf(c) ?? shortId(c)}
              detail={nameOf(c) ? shortId(c) : undefined}
            />
          ))}
          {used.contracts.map((c) => {
            const name = nameOf(c.id)
            const types = c.types.join(', ')
            return (
              <ContractOption
                key={c.id}
                checked={value === c.id}
                onSelect={() => {
                  choose(c.id)
                }}
                title={name ?? shortId(c.id)}
                detail={[name ? shortId(c.id) : '', types].filter(Boolean).join(' · ')}
                count={c.count}
              />
            )
          })}
        </fieldset>
        <p className="m-0 text-ink-2 text-sm" aria-live="polite">
          {used.pending
            ? t`Reading this identity’s transitions…`
            : used.failed
              ? t`Platform Explorer did not answer.`
              : used.contracts.length === 0
                ? t`None of its transitions acts on a contract.`
                : used.more
                  ? plural(used.scanned, {
                      one: 'From its latest transition of a type that acts on a contract.',
                      other: 'From its latest # transitions of the types that act on a contract.',
                    })
                  : plural(used.scanned, {
                      one: 'From its one transition of a type that acts on a contract.',
                      other: 'From all # of its transitions of the types that act on a contract.',
                    })}{' '}
          {used.failed ? (
            <button type="button" className="dh-btn dh-btn--link" onClick={used.retry}>
              {t`Try again`}
            </button>
          ) : used.more ? (
            <button type="button" className="dh-btn dh-btn--link" onClick={used.scanMore}>
              {t`Look further back`}
            </button>
          ) : null}
        </p>
        <div className="grid gap-1">
          <label htmlFor={inputId} className="text-sm">
            {t`Or paste a contract ID`}
          </label>
          <div className="flex gap-2">
            <input
              id={inputId}
              type="text"
              className="dh-input dh-input--sm min-w-0 flex-1"
              value={draft}
              spellCheck={false}
              autoComplete="off"
              aria-invalid={error ? true : undefined}
              onChange={(e) => {
                setDraft(e.target.value)
                setError(undefined)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  paste()
                }
              }}
            />
            <button type="button" className="dh-btn dh-btn--sm" onClick={paste}>
              {t`Apply`}
            </button>
          </div>
          {error ? (
            <span role="alert" className="text-bad text-sm">
              {error}
            </span>
          ) : null}
        </div>
      </div>
    </details>
  )
}

function ContractOption({
  checked,
  onSelect,
  title,
  detail,
  count,
}: {
  checked: boolean
  onSelect: () => void
  title: string
  detail?: string | undefined
  count?: number | undefined
}) {
  return (
    <label className="flex items-start gap-2 rounded-1 px-1 py-0.5 text-sm hover:bg-hover">
      <input
        type="radio"
        name="identity-tx-contract"
        className="mt-1"
        checked={checked}
        onChange={onSelect}
      />
      <span className="grid min-w-0 flex-1">
        <span className="truncate">{title}</span>
        {detail ? <span className="truncate text-ink-2 text-xs">{detail}</span> : null}
      </span>
      {count === undefined ? null : (
        <span
          className="text-ink-2 text-xs tabular-nums"
          title={plural(count, { one: '# transition', other: '# transitions' })}
        >
          {formatInt(count)}
        </span>
      )}
    </label>
  )
}
