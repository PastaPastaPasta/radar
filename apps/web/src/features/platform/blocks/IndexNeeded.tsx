import { useLingui } from '@lingui/react/macro'
import { useNavigate } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'
import { Card, Unavailable } from '@/ui'

const HASH = /^[0-9a-f]{64}$/i
const HEIGHT = /^\d{1,10}$/

/**
 * What a page that lists Platform's blocks or state transitions shows while Decentralized only mode is on: Platform
 * keeps no list of either, so it says so once, and offers the two lookups a node can still answer.
 */
export function IndexNeeded() {
  const { t } = useLingui()
  const navigate = useNavigate()
  const [hash, setHash] = useState('')
  const [height, setHeight] = useState('')
  const [hashError, setHashError] = useState(false)
  const [heightNote, setHeightNote] = useState(false)

  const openHash = (e: FormEvent) => {
    e.preventDefault()
    const value = hash.trim()
    if (!HASH.test(value)) {
      setHashError(true)
      return
    }
    setHashError(false)
    void navigate({ to: '/platform/tx/$hash', params: { hash: value.toLowerCase() } })
  }
  const askHeight = (e: FormEvent) => {
    e.preventDefault()
    setHeightNote(HEIGHT.test(height.trim()))
  }

  return (
    <div className="grid gap-4" data-index-needed>
      <Unavailable
        source="pe"
        title={t`Platform keeps no list of blocks or transitions; this needs Platform Explorer's index`}
      />
      <Card layer="platform" title={t`What a node can still answer`}>
        <div className="grid gap-5 sm:grid-cols-2">
          <form className="grid gap-2" onSubmit={openHash}>
            <label className="grid gap-1 text-sm" htmlFor="pb-hash">
              <span className="font-semibold">{t`Open a state transition by its hash`}</span>
              <span className="text-ink-2">
                {t`A node reports whether a transition executed, and its error if it failed.`}
              </span>
            </label>
            <div className="flex flex-wrap gap-2">
              <input
                id="pb-hash"
                className="dh-input dh-input--sm min-w-0 flex-1"
                value={hash}
                placeholder={t`64 hexadecimal characters`}
                spellCheck={false}
                autoComplete="off"
                aria-invalid={hashError || undefined}
                onChange={(e) => {
                  setHash(e.target.value)
                  setHashError(false)
                }}
              />
              <button type="submit" className="dh-btn dh-btn--sm">
                {t`Open`}
              </button>
            </div>
            {hashError ? (
              <p role="alert" className="m-0 text-sm text-bad">
                {t`A state transition hash is 64 hexadecimal characters.`}
              </p>
            ) : null}
          </form>
          <form className="grid gap-2" onSubmit={askHeight}>
            <label className="grid gap-1 text-sm" htmlFor="pb-height">
              <span className="font-semibold">{t`Look up a block by its height`}</span>
              <span className="text-ink-2">
                {t`Only an index knows which block holds a height.`}
              </span>
            </label>
            <div className="flex flex-wrap gap-2">
              <input
                id="pb-height"
                className="dh-input dh-input--sm min-w-0 flex-1"
                inputMode="numeric"
                value={height}
                placeholder={t`Block height`}
                autoComplete="off"
                onChange={(e) => {
                  setHeight(e.target.value)
                  setHeightNote(false)
                }}
              />
              <button type="submit" className="dh-btn dh-btn--sm">
                {t`Look up`}
              </button>
            </div>
            {heightNote ? (
              <p role="status" className="m-0 text-sm" data-height-note>
                {t`Block pages need Platform Explorer's index, which Decentralized only mode keeps off.`}
              </p>
            ) : null}
          </form>
        </div>
      </Card>
    </div>
  )
}
