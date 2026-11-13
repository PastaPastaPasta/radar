import { useLingui } from '@lingui/react/macro'
import { useState } from 'react'
import { isPlatformId } from '@/lib/base58'
import { useSetSearch } from './common'

/** A one-field form for a Platform ID: the value goes to `onSubmit` only when it is a valid ID (or empty, if `optional`). */
export function IdForm({
  initial = '',
  label,
  submit,
  invalid,
  optional = false,
  clearOnSubmit = false,
  onSubmit,
}: {
  initial?: string
  label: string
  submit: string
  invalid: string
  optional?: boolean
  clearOnSubmit?: boolean
  onSubmit: (value: string) => void
}) {
  const [draft, setDraft] = useState(initial)
  const [problem, setProblem] = useState<string>()
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        const value = draft.trim()
        if (!(optional && value === '') && !isPlatformId(value)) {
          setProblem(invalid)
          return
        }
        setProblem(undefined)
        if (clearOnSubmit) setDraft('')
        onSubmit(value)
      }}
    >
      <label className="flex flex-wrap items-center gap-2">
        <span>{label}</span>
        <input
          className="dh-input dh-input--sm"
          value={draft}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={problem ? true : undefined}
          onChange={(e) => {
            setDraft(e.target.value)
          }}
        />
      </label>
      <button type="submit" className="dh-btn dh-btn--sm">
        {submit}
      </button>
      {problem ? (
        <span role="alert" className="text-bad">
          {problem}
        </span>
      ) : null}
    </form>
  )
}

/** Platform answers group membership and contract nonces only for contracts it is told about. */
export function ContractForm({ contract }: { contract: string | undefined }) {
  const { t } = useLingui()
  const setSearch = useSetSearch()
  return (
    <IdForm
      key={contract ?? ''}
      initial={contract}
      label={t`Contract ID`}
      submit={t`Check`}
      invalid={t`That isn’t a contract ID: it is 43 or 44 base58 characters.`}
      optional
      onSubmit={(c) => {
        setSearch({ contract: c === '' ? undefined : c })
      }}
    />
  )
}
