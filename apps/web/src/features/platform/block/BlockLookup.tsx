import { useLingui } from '@lingui/react/macro'
import { useNavigate } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'
import { PageLink } from '@/features/entity'
import { parseBlockRef } from './use-platform-block'

/** A box that opens another block by its height or hash, with the way to the search page. */
export function BlockLookup() {
  const { t } = useLingui()
  const navigate = useNavigate()
  const [value, setValue] = useState('')
  const [bad, setBad] = useState(false)
  const go = (e: FormEvent) => {
    e.preventDefault()
    const text = value.trim()
    if (!parseBlockRef(text)) {
      setBad(true)
      return
    }
    setBad(false)
    void navigate({ to: '/platform/block/$id', params: { id: text } })
  }
  return (
    <form className="grid gap-2" onSubmit={go} data-block-lookup>
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="dh-input dh-input--sm"
          aria-label={t`Block height or hash`}
          placeholder={t`Block height or hash`}
          value={value}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={bad || undefined}
          onChange={(e) => {
            setValue(e.target.value)
            setBad(false)
          }}
        />
        <button type="submit" className="dh-btn dh-btn--sm">
          {t`Open block`}
        </button>
        <PageLink to="/search">{t`Search Radar`}</PageLink>
      </div>
      {bad ? (
        <p role="alert" className="m-0 text-sm text-bad">
          {t`Enter a block height, or a hash of 64 hexadecimal characters.`}
        </p>
      ) : null}
    </form>
  )
}
