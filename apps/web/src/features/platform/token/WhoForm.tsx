import { useLingui } from '@lingui/react/macro'
import { useState } from 'react'
import { readIdentityText } from './identity-input'
import { useSetSearch } from '../identity/common'
import type { Who } from './use-who'

/** A one-field form for an identity ID or DPNS name; a valid entry goes to the address as `who`. */
export function WhoForm({ who }: { who: string | undefined }) {
  const { t } = useLingui()
  const setSearch = useSetSearch()
  const [draft, setDraft] = useState(who ?? '')
  const [problem, setProblem] = useState(false)
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (readIdentityText(draft).kind === 'invalid') {
          setProblem(true)
          return
        }
        setProblem(false)
        setSearch({ who: draft.trim() })
      }}
    >
      <label className="flex flex-wrap items-center gap-2">
        <span>{t`Identity ID or name`}</span>
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
        {t`Look up`}
      </button>
      {problem ? (
        <span role="alert" className="text-bad">
          {t`That is neither an identity ID nor a DPNS name.`}
        </span>
      ) : null}
    </form>
  )
}

/** Says why a `who` value gave no identity; draws nothing while it has one or none was asked. */
export function WhoProblem({ who }: { who: Who }) {
  const { t } = useLingui()
  const name = 'name' in who ? who.name : ''
  switch (who.state) {
    case 'invalid':
      return <p role="status">{t`That is neither an identity ID nor a DPNS name.`}</p>
    case 'not-found':
      return <p role="status">{t`No identity has the name ${name}.`}</p>
    case 'error':
      return (
        <p role="status">
          {t`The name ${name} could not be looked up.`}{' '}
          <button type="button" className="dh-btn dh-btn--sm" onClick={who.retry}>
            {t`Try again`}
          </button>
        </p>
      )
    default:
      return null
  }
}
