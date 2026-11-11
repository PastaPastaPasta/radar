import { useLingui } from '@lingui/react/macro'
import { useId, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { local } from '@/data/envelope'
import { PageLink, useDocumentTitle, useNetwork } from '@/features/entity'
import { classify, useWordlistLoaded } from '@/features/search'
import { Badge, Card, Hash } from '@/ui'
import { verifySignedMessage, type VerifyOutcome } from './verify'

interface Fields {
  address: string
  message: string
  signature: string
}

const EMPTY: Fields = { address: '', message: '', signature: '' }

export function VerifyMessagePage() {
  const { t } = useLingui()
  const net = useNetwork()
  useDocumentTitle(t`Verify message`)
  const ids = { address: useId(), message: useId(), signature: useId() }
  const [fields, setFields] = useState<Fields>(EMPTY)
  const [outcome, setOutcome] = useState<(VerifyOutcome & { for: Fields }) | undefined>()
  const stamp = useMemo(() => local(null), [])

  useWordlistLoaded()
  const secret = (['address', 'message', 'signature'] as const).some(
    (k) => classify(fields[k], net).warning === 'secret',
  )
  const ready = fields.address.trim() !== '' && fields.signature.trim() !== '' && !secret
  const current =
    outcome?.for.address === fields.address &&
    outcome.for.message === fields.message &&
    outcome.for.signature === fields.signature
      ? outcome
      : undefined

  const set = (key: keyof Fields) => (value: string) => {
    setFields((f) => ({ ...f, [key]: value }))
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!ready) return
    setOutcome({ ...verifySignedMessage(fields), for: fields })
  }

  return (
    <article data-page="/tools/verify-message" data-layer="core" className="grid gap-6">
      <header className="grid gap-2">
        <p data-eyebrow className="text-sm text-[var(--dh-ink-2,inherit)]">
          {t`Tools`}
        </p>
        <h1 className="text-3xl font-semibold">{t`Verify message`}</h1>
        <p className="text-[var(--dh-ink-2,inherit)]">
          {t`Check that a Dash address signed a message. The check runs in this browser: nothing you type here is sent anywhere, and Radar never asks for a key.`}
        </p>
      </header>

      <Card title={t`Signed message`} layer="core" source={stamp}>
        <form className="grid gap-4" onSubmit={submit} noValidate>
          <Field id={ids.address} label={t`Address`}>
            <input
              id={ids.address}
              name="address"
              className="dh-input rx-mono"
              autoComplete="off"
              spellCheck={false}
              value={fields.address}
              onChange={(e) => {
                set('address')(e.target.value)
              }}
            />
          </Field>
          <Field id={ids.message} label={t`Message`}>
            <textarea
              id={ids.message}
              name="message"
              className="dh-input"
              rows={4}
              autoComplete="off"
              spellCheck={false}
              value={fields.message}
              onChange={(e) => {
                set('message')(e.target.value)
              }}
            />
          </Field>
          <Field id={ids.signature} label={t`Signature`}>
            <textarea
              id={ids.signature}
              name="signature"
              className="dh-input rx-mono"
              rows={3}
              autoComplete="off"
              spellCheck={false}
              value={fields.signature}
              onChange={(e) => {
                set('signature')(e.target.value)
              }}
            />
          </Field>
          {secret ? (
            <p role="alert" data-secret-notice>
              {t`This looks like a private key or a recovery phrase. Radar never needs one, so it won’t check it. Clear the field and paste the signed message instead.`}
            </p>
          ) : null}
          <p className="text-sm text-[var(--dh-ink-2,inherit)]">
            {t`Spaces and line breaks in the message count: it must be exactly what was signed.`}
          </p>
          <div className="rx-form-actions" data-form-actions>
            <button type="submit" className="dh-btn dh-btn--primary" disabled={!ready}>
              {t`Verify`}
            </button>
            <button
              type="button"
              className="dh-btn"
              onClick={() => {
                setFields(EMPTY)
                setOutcome(undefined)
              }}
            >
              {t`Clear`}
            </button>
          </div>
        </form>
      </Card>

      <div role="status" aria-live="polite">
        {current ? <Result outcome={current} /> : null}
      </div>
    </article>
  )
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      {children}
    </div>
  )
}

function Result({ outcome }: { outcome: VerifyOutcome }) {
  const { t } = useLingui()
  const net = useNetwork()
  const elsewhere =
    outcome.kind !== 'error' && outcome.network !== (net === 'testnet' ? 'testnet' : 'mainnet')

  if (outcome.kind === 'valid') {
    return (
      <Card layer="core">
        <p className="flex flex-wrap items-center gap-2 text-lg font-semibold" data-result="valid">
          <Badge tone="success">{t`Valid`}</Badge>
          {t`This address signed this message.`}
        </p>
        {elsewhere ? <OtherNetworkNote network={outcome.network} /> : null}
      </Card>
    )
  }
  if (outcome.kind === 'mismatch') {
    return (
      <Card layer="core">
        <p
          className="flex flex-wrap items-center gap-2 text-lg font-semibold"
          data-result="invalid"
        >
          <Badge tone="danger">{t`Invalid`}</Badge>
          {t`This address did not sign this message.`}
        </p>
        <p className="mt-2">
          {t`The signature is well formed, but it was made by a different key. It matches this address:`}
        </p>
        <p className="mt-1">
          <Hash value={outcome.signedBy} display="wrap" />
        </p>
        {elsewhere ? <OtherNetworkNote network={outcome.network} /> : null}
      </Card>
    )
  }
  return (
    <Card layer="core">
      <p className="flex flex-wrap items-center gap-2 text-lg font-semibold" data-result="error">
        <Badge tone="warning">{t`Can’t check`}</Badge>
        {outcome.problem === 'address'
          ? t`That isn’t a Dash address Radar can check.`
          : outcome.problem === 'script-address'
            ? t`A script address (starting with 7 or 8) can’t sign a message.`
            : t`That isn’t a Dash signature.`}
      </p>
      <p className="mt-2">
        {outcome.problem === 'signature'
          ? t`A signature is 88 characters of base64 and ends with “=”, as printed by Dash Core’s signmessage.`
          : t`Use the address that signed, which starts with X on mainnet and y on testnet.`}
      </p>
    </Card>
  )
}

function OtherNetworkNote({ network }: { network: 'mainnet' | 'testnet' }) {
  const { t } = useLingui()
  return (
    <p className="mt-2 text-sm">
      {network === 'testnet' ? t`This is a testnet address.` : t`This is a mainnet address.`}{' '}
      <PageLink to="/tools/verify-message" search={{ network }}>
        {network === 'testnet' ? t`Switch to testnet` : t`Switch to mainnet`}
      </PageLink>
    </p>
  )
}
