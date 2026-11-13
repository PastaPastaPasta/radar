import { useLingui } from '@lingui/react/macro'
import { useState, type FormEvent } from 'react'
import { entityLabel, useNetwork } from '@/features/entity'
import { Card, Empty, Hash, networkName } from '@/ui'
import {
  LABEL_KINDS,
  MAX_LABEL_LENGTH,
  removeLabel,
  setLabel,
  useLocalLabels,
  type LabelKind,
} from '../labels'

const BASE58_ID = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

export function LabelsCard() {
  const { t } = useLingui()
  const removeLabelName = (name: string) => t`Remove the label ${name}`
  const net = useNetwork()
  const labels = useLocalLabels()
  const [kind, setKind] = useState<LabelKind>('identity')
  const [id, setId] = useState('')
  const [text, setText] = useState('')
  const [error, setError] = useState<'id' | 'label'>()

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const trimmedId = id.trim()
    if (!BASE58_ID.test(trimmedId)) {
      setError('id')
      return
    }
    if (text.trim() === '') {
      setError('label')
      return
    }
    setError(undefined)
    setLabel({ net, kind, id: trimmedId, label: text })
    setId('')
    setText('')
  }

  return (
    <Card
      id="labels"
      title={t`Your own names`}
      subtitle={t`Name an identity, contract or token. The name shows wherever Radar shows that ID, on this device only, and wins over Radar’s own names.`}
    >
      <form className="grid max-w-xl gap-3" onSubmit={submit} aria-label={t`Add a name`}>
        <div className="dh-field">
          <label htmlFor="label-kind">{t`Kind`}</label>
          <select
            id="label-kind"
            className="dh-select"
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as LabelKind)
            }}
          >
            {LABEL_KINDS.map((k) => (
              <option key={k} value={k}>
                {entityLabel(k)}
              </option>
            ))}
          </select>
        </div>
        <div className="dh-field">
          <label htmlFor="label-id">{t`ID on ${networkName(net)}`}</label>
          <input
            id="label-id"
            className="dh-input dh-input--mono"
            value={id}
            spellCheck={false}
            autoCapitalize="none"
            aria-invalid={error === 'id' ? true : undefined}
            onChange={(e) => {
              setId(e.target.value)
            }}
          />
          {error === 'id' ? (
            <p role="alert" className="dh-field__error">
              {t`Enter the ID as Base58 text, 32 to 44 characters.`}
            </p>
          ) : null}
        </div>
        <div className="dh-field">
          <label htmlFor="label-text">{t`Name`}</label>
          <input
            id="label-text"
            className="dh-input"
            value={text}
            maxLength={MAX_LABEL_LENGTH}
            aria-invalid={error === 'label' ? true : undefined}
            onChange={(e) => {
              setText(e.target.value)
            }}
          />
          {error === 'label' ? (
            <p role="alert" className="dh-field__error">
              {t`Give it a name.`}
            </p>
          ) : null}
        </div>
        <p>
          <button type="submit" className="dh-btn">
            {t`Add name`}
          </button>
        </p>
      </form>

      <div className="mt-4">
        {labels.length === 0 ? (
          <Empty kind="none-yet" title={t`No names of your own yet`} />
        ) : (
          <ul className="grid gap-2" aria-label={t`Your names`}>
            {labels.map((l) => (
              <li
                key={`${l.net}/${l.kind}/${l.id}`}
                className="flex flex-wrap items-center gap-3 border-b border-[var(--dh-line)] pb-2"
              >
                <span className="text-[var(--dh-ink-2)]">
                  {networkName(l.net)} · {entityLabel(l.kind)}
                </span>
                <strong>{l.label}</strong>
                <Hash value={l.id} display="short" />
                <button
                  type="button"
                  className="dh-btn dh-btn--quiet dh-btn--sm ms-auto"
                  aria-label={removeLabelName(l.label)}
                  onClick={() => {
                    removeLabel(l)
                  }}
                >
                  {t`Remove`}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  )
}
