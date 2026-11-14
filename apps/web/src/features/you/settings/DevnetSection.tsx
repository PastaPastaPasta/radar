import { plural } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import { useState, type FormEvent } from 'react'
import { PageLink, withNetwork } from '@/features/entity'
import type { DevnetConfig } from '@/lib/network'
import { announce, Card } from '@/ui'
import { copyText } from '@/ui/clipboard'
import { parseDevnetForm, type DevnetFormError } from './devnet'

export interface SettingsDevnets {
  saved: DevnetConfig[]
  /** Saves or replaces the devnet with this name. */
  save(config: DevnetConfig): void
  remove(name: string): void
}

function DevnetForm({
  initial,
  existing,
  onSubmit,
  onCancel,
}: {
  initial?: DevnetConfig
  /** The names already saved, which a new devnet may not reuse. */
  existing?: readonly string[]
  onSubmit: (config: DevnetConfig) => void
  onCancel?: () => void
}) {
  const { t } = useLingui()
  const [name, setName] = useState(initial?.name ?? '')
  const [addresses, setAddresses] = useState(initial?.dapiAddresses.join('\n') ?? '')
  const [quorumUrl, setQuorumUrl] = useState(initial?.quorumUrl ?? '')
  const [error, setError] = useState<DevnetFormError>()

  const editName = initial?.name ?? ''
  const fieldKey = initial?.name ?? 'new'
  const messages: Record<DevnetFormError, string> = {
    name: t`Use lowercase letters, digits and hyphens, for example "ruby".`,
    exists: t`A devnet with this name is already saved. Edit it instead.`,
    addresses: t`Enter at least one DAPI address as host:port, one per line.`,
    quorum: t`The quorum list URL must start with https://.`,
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const result = parseDevnetForm(
      { name: initial?.name ?? name, addresses, quorumUrl },
      { checkName: !initial, existing },
    )
    if ('error' in result) {
      setError(result.error)
      return
    }
    setError(undefined)
    onSubmit(result.config)
    if (!initial) {
      setName('')
      setAddresses('')
      setQuorumUrl('')
    }
  }

  return (
    <form
      onSubmit={submit}
      className="grid max-w-xl gap-3"
      aria-label={initial ? t`Edit ${editName}` : t`Add a devnet`}
    >
      {initial ? null : (
        <div className="dh-field">
          <label htmlFor="devnet-name">{t`Devnet name`}</label>
          <input
            id="devnet-name"
            className="dh-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ruby"
            autoCapitalize="none"
            spellCheck={false}
            aria-invalid={error === 'name' || error === 'exists' || undefined}
          />
        </div>
      )}
      <div className="dh-field">
        <label htmlFor={`devnet-addresses-${fieldKey}`}>{t`DAPI addresses`}</label>
        <textarea
          id={`devnet-addresses-${fieldKey}`}
          className="dh-textarea dh-input--mono"
          rows={3}
          value={addresses}
          onChange={(e) => setAddresses(e.target.value)}
          placeholder="192.0.2.10:1443"
          spellCheck={false}
          aria-invalid={error === 'addresses' || undefined}
        />
      </div>
      <div className="dh-field">
        <label htmlFor={`devnet-quorum-${fieldKey}`}>
          {t`Quorum list URL`} <span className="dh-field__optional">{t`optional`}</span>
        </label>
        <input
          id={`devnet-quorum-${fieldKey}`}
          className="dh-input"
          type="url"
          value={quorumUrl}
          onChange={(e) => setQuorumUrl(e.target.value)}
          aria-invalid={error === 'quorum' || undefined}
        />
      </div>
      {error ? (
        <p role="alert" className="dh-field__error">
          {messages[error]}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="dh-btn">
          {initial ? t`Save changes` : t`Add devnet`}
        </button>
        {onCancel ? (
          <button type="button" className="dh-btn dh-btn--quiet" onClick={onCancel}>
            {t`Cancel`}
          </button>
        ) : null}
      </div>
    </form>
  )
}

const addressCount = (count: number) =>
  plural(count, { one: '# DAPI address', other: '# DAPI addresses' })

export function DevnetSection({ devnets }: { devnets: SettingsDevnets }) {
  const { t } = useLingui()
  const [editing, setEditing] = useState<string>()
  const removeLabel = (devnet: string) => t`Remove ${devnet}`
  const copyLabel = (devnet: string) => t`Copy a link to ${devnet}`
  const copyLink = (name: string) => {
    const url = new URL(withNetwork('/', `devnet-${name}`), window.location.origin).href
    void copyText(url).then((ok) => {
      if (ok) announce(t`Link copied`)
    })
  }
  return (
    <Card
      id="devnets"
      title={t`Custom devnets`}
      subtitle={t`Saved in this browser. A devnet with a name Radar doesn’t know asks for its addresses.`}
    >
      {devnets.saved.length === 0 ? (
        <p className="mb-4 text-[var(--dh-ink-2)]">{t`No devnets saved.`}</p>
      ) : (
        <ul className="mb-4 grid gap-3" aria-label={t`Saved devnets`}>
          {devnets.saved.map((d) => (
            <li key={d.name} className="grid gap-2 border-b border-[var(--dh-line)] pb-3">
              <div className="flex flex-wrap items-center gap-3">
                <strong>{d.name}</strong>
                <span className="text-[var(--dh-ink-2)]">
                  {addressCount(d.dapiAddresses.length)}
                </span>
                <PageLink to="/" search={{ network: `devnet-${d.name}` }}>
                  {t`Open`}
                </PageLink>
                <button
                  type="button"
                  className="dh-btn dh-btn--quiet dh-btn--sm"
                  aria-label={copyLabel(d.name)}
                  onClick={() => {
                    copyLink(d.name)
                  }}
                >
                  {t`Copy link`}
                </button>
                <button
                  type="button"
                  className="dh-btn dh-btn--quiet dh-btn--sm"
                  onClick={() => setEditing(editing === d.name ? undefined : d.name)}
                  aria-expanded={editing === d.name}
                >
                  {t`Edit`}
                </button>
                <button
                  type="button"
                  className="dh-btn dh-btn--destructive dh-btn--sm"
                  aria-label={removeLabel(d.name)}
                  onClick={() => devnets.remove(d.name)}
                >
                  {t`Remove`}
                </button>
              </div>
              <p className="text-[var(--dh-ink-2)] break-all">
                <code>{d.dapiAddresses.join(' · ')}</code>
                {d.quorumUrl ? (
                  <>
                    {' '}
                    · <code>{d.quorumUrl}</code>
                  </>
                ) : null}
              </p>
              {editing === d.name ? (
                <DevnetForm
                  initial={d}
                  onSubmit={(config) => {
                    devnets.save(config)
                    setEditing(undefined)
                  }}
                  onCancel={() => setEditing(undefined)}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <DevnetForm
        existing={devnets.saved.map((d) => d.name)}
        onSubmit={(config) => devnets.save(config)}
      />
    </Card>
  )
}
