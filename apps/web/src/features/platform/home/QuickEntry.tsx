import { useLingui } from '@lingui/react/macro'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { classify, useSearch } from '@/features/search'
import { useNetwork } from '@/features/entity'
import { Card } from '@/ui'

const EXPLICIT_NAME = /\.dash$/i

/**
 * NX-03: one box for an identity ID, a DPNS name, a token ID or an epoch number. An epoch number opens the epoch; any
 * other input goes through the search resolvers and opens the entity when exactly one confirmed match comes back, and
 * the search page otherwise. A recovery phrase or key is never sent anywhere.
 */
export function QuickEntry() {
  const { t } = useLingui()
  const net = useNetwork()
  const navigate = useNavigate()
  const inputId = useId()
  const [text, setText] = useState('')
  const [asked, setAsked] = useState<string | undefined>()
  const [withheld, setWithheld] = useState(false)
  const result = useSearch(asked ?? '', { mode: 'page' })
  const handled = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (asked === undefined || handled.current === asked || result.pending.length > 0) return
    handled.current = asked
    const confirmed = result.hits.filter((h) => !h.speculative)
    const only =
      confirmed.length === 1
        ? confirmed[0]
        : EXPLICIT_NAME.test(asked) && result.hits.length === 1
          ? result.hits[0]
          : undefined
    if (only) void navigate(only.href as never)
    else void navigate({ to: '/search', search: { q: asked } as never })
  }, [asked, result, navigate])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const value = text.trim()
    if (!value) return
    setWithheld(false)
    const c = classify(value, net)
    if (c.warning) {
      setWithheld(true)
      return
    }
    if (c.classes[0] === 'int') {
      void navigate({ to: '/epoch/$n', params: { n: String(Number(value)) } })
      return
    }
    handled.current = undefined
    setAsked(value)
  }

  return (
    <Card
      id="quick-entry"
      layer="platform"
      title={t`Go straight to`}
      subtitle={t`An identity ID, a name, a token ID or an epoch number.`}
    >
      <form
        role="search"
        aria-label={t`Find on Platform`}
        onSubmit={submit}
        className="flex flex-wrap gap-2"
      >
        <label htmlFor={inputId} className="dh-sr">
          {t`Identity ID, name.dash, token ID or epoch number`}
        </label>
        <input
          id={inputId}
          className="dh-input min-w-0 flex-1"
          type="text"
          value={text}
          autoComplete="off"
          spellCheck={false}
          placeholder={t`Identity ID, name.dash, token ID or epoch`}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" className="dh-btn" disabled={asked !== undefined}>
          {asked === undefined ? t`Go` : t`Looking…`}
        </button>
      </form>
      <p role="status" className="mt-2 text-sm text-[var(--dh-ink-2,inherit)]">
        {withheld
          ? t`That looks like a recovery phrase or a private key. It was not sent anywhere.`
          : ''}
      </p>
    </Card>
  )
}
