import { useLingui } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { useState, useSyncExternalStore, type FormEvent } from 'react'
import {
  DEFAULT_LOG_LEVEL,
  getSdkSettings,
  normalizeQuorumUrl,
  quorumUrlProblem,
  SDK_LIMITS,
  SDK_LOG_LEVELS,
  setSdkSettings,
  subscribeSdkSettings,
  type QuorumNetwork,
  type SdkLogLevel,
  type SdkSettings,
} from '@/data/sdk/settings'
import { announce, Card } from '@/ui'
import { refetchSdkQueries } from './sdk-cache'

interface Draft {
  mainnet: string
  testnet: string
  timeout: string
  retries: string
  ban: 'default' | 'on' | 'off'
  logs: SdkLogLevel
}

const draftOf = (s: SdkSettings): Draft => ({
  mainnet: s.quorumUrls.mainnet ?? '',
  testnet: s.quorumUrls.testnet ?? '',
  timeout: s.requestTimeoutMs === undefined ? '' : String(s.requestTimeoutMs),
  retries: s.retries === undefined ? '' : String(s.retries),
  ban: s.banFailedAddress === undefined ? 'default' : s.banFailedAddress ? 'on' : 'off',
  logs: s.logLevel ?? DEFAULT_LOG_LEVEL,
})

type Field = keyof Draft

function omit<K extends keyof SdkSettings>(settings: SdkSettings, key: K): SdkSettings {
  const next = { ...settings }
  delete next[key]
  return next
}
type Errors = Partial<Record<Field, string>>

/** The settings a draft stands for, or what is wrong with each field. */
function settingsOfDraft(
  d: Draft,
  messages: { url: string; https: string; whole: (min: number, max: number) => string },
): { settings: SdkSettings } | { errors: Errors } {
  const errors: Errors = {}
  const quorumUrls: SdkSettings['quorumUrls'] = {}
  for (const net of ['mainnet', 'testnet'] as const satisfies readonly QuorumNetwork[]) {
    const text = normalizeQuorumUrl(d[net])
    if (text === '') continue
    const problem = quorumUrlProblem(text)
    if (problem) errors[net] = problem === 'scheme' ? messages.https : messages.url
    else quorumUrls[net] = text
  }
  const whole = (field: 'timeout' | 'retries', { min, max }: { min: number; max: number }) => {
    const text = d[field].trim()
    if (text === '') return undefined
    const n = Number(text)
    if (!Number.isInteger(n) || n < min || n > max) {
      errors[field] = messages.whole(min, max)
      return undefined
    }
    return n
  }
  const requestTimeoutMs = whole('timeout', SDK_LIMITS.requestTimeoutMs)
  const retries = whole('retries', SDK_LIMITS.retries)
  if (Object.keys(errors).length > 0) return { errors }
  return {
    settings: {
      quorumUrls,
      ...(requestTimeoutMs !== undefined ? { requestTimeoutMs } : {}),
      ...(retries !== undefined ? { retries } : {}),
      ...(d.ban === 'default' ? {} : { banFailedAddress: d.ban === 'on' }),
      ...(d.logs === DEFAULT_LOG_LEVEL ? {} : { logLevel: d.logs }),
    },
  }
}

function useSavedSdkSettings(): SdkSettings {
  return useSyncExternalStore(subscribeSdkSettings, getSdkSettings, getSdkSettings)
}

export function ConnectionCard() {
  const { t } = useLingui()
  const client = useQueryClient()
  const saved = useSavedSdkSettings()
  const [draft, setDraft] = useState<Draft>(() => draftOf(saved))
  const [errors, setErrors] = useState<Errors>({})
  const [applied, setApplied] = useState(false)
  const base = draftOf(saved)

  const apply = (next: SdkSettings) => {
    setSdkSettings(next)
    void refetchSdkQueries(client)
    setApplied(true)
    announce(t`Connection settings applied. The Platform SDK restarted.`)
  }

  const set = <K extends Field>(field: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [field]: value }))
    setApplied(false)
  }

  const messages = {
    url: t`Enter a full address such as https://quorums.example.org.`,
    https: t`The quorum list address must start with https://.`,
    whole: (min: number, max: number) => t`Whole number from ${min} to ${max}.`,
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const result = settingsOfDraft(draft, messages)
    if ('errors' in result) {
      setErrors(result.errors)
      return
    }
    setErrors({})
    apply(result.settings)
    setDraft(draftOf(result.settings))
  }

  const defaults = draftOf({ quorumUrls: {} })
  const reset = (field: Field, clear: (s: SdkSettings) => SdkSettings) => {
    setDraft((d) => ({ ...d, [field]: defaults[field] }))
    setErrors({})
    apply(clear(saved))
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(base)
  const resetButton = (field: Field, onReset: () => void) => (
    <button
      type="button"
      className="dh-btn dh-btn--quiet dh-btn--sm"
      disabled={draft[field] === defaults[field] && base[field] === defaults[field]}
      onClick={onReset}
    >
      {t`Reset`}
    </button>
  )

  return (
    <Card
      id="connection"
      title={t`Connection`}
      subtitle={t`How Radar talks to Dash Platform. A change restarts the Platform SDK; nothing here leaves this browser.`}
    >
      <form className="grid max-w-xl gap-4" onSubmit={submit} aria-label={t`Connection settings`}>
        {(['mainnet', 'testnet'] as const).map((net) => (
          <div className="dh-field" key={net}>
            <label htmlFor={`quorum-${net}`}>
              {net === 'mainnet' ? t`Quorum list URL, Mainnet` : t`Quorum list URL, Testnet`}{' '}
              <span className="dh-field__optional">{t`optional`}</span>
            </label>
            <div className="flex gap-2">
              <input
                id={`quorum-${net}`}
                className="dh-input flex-1"
                type="url"
                inputMode="url"
                value={draft[net]}
                placeholder={`https://quorums.${net}.networks.dash.org`}
                spellCheck={false}
                aria-invalid={errors[net] ? true : undefined}
                aria-describedby={errors[net] ? `quorum-${net}-error` : undefined}
                onChange={(e) => {
                  set(net, e.target.value)
                }}
              />
              {resetButton(net, () => {
                reset(net, (s) => ({
                  ...s,
                  quorumUrls: { ...s.quorumUrls, [net]: undefined },
                }))
              })}
            </div>
            {errors[net] ? (
              <p id={`quorum-${net}-error`} role="alert" className="dh-field__error">
                {errors[net]}
              </p>
            ) : null}
          </div>
        ))}

        <div className="dh-field">
          <label htmlFor="sdk-timeout">{t`Request timeout (ms)`}</label>
          <div className="flex gap-2">
            <input
              id="sdk-timeout"
              className="dh-input flex-1"
              inputMode="numeric"
              value={draft.timeout}
              placeholder="8000"
              aria-invalid={errors.timeout ? true : undefined}
              onChange={(e) => {
                set('timeout', e.target.value)
              }}
            />
            {resetButton('timeout', () => {
              reset('timeout', (s) => omit(s, 'requestTimeoutMs'))
            })}
          </div>
          {errors.timeout ? (
            <p role="alert" className="dh-field__error">
              {errors.timeout}
            </p>
          ) : null}
        </div>

        <div className="dh-field">
          <label htmlFor="sdk-retries">{t`Retries`}</label>
          <div className="flex gap-2">
            <input
              id="sdk-retries"
              className="dh-input flex-1"
              inputMode="numeric"
              value={draft.retries}
              placeholder={t`SDK default`}
              aria-invalid={errors.retries ? true : undefined}
              onChange={(e) => {
                set('retries', e.target.value)
              }}
            />
            {resetButton('retries', () => {
              reset('retries', (s) => omit(s, 'retries'))
            })}
          </div>
          {errors.retries ? (
            <p role="alert" className="dh-field__error">
              {errors.retries}
            </p>
          ) : null}
        </div>

        <div className="dh-field">
          <label htmlFor="sdk-ban">{t`Ban nodes that fail`}</label>
          <div className="flex gap-2">
            <select
              id="sdk-ban"
              className="dh-select flex-1"
              value={draft.ban}
              onChange={(e) => {
                set('ban', e.target.value as Draft['ban'])
              }}
            >
              <option value="default">{t`SDK default`}</option>
              <option value="on">{t`Yes`}</option>
              <option value="off">{t`No`}</option>
            </select>
            {resetButton('ban', () => {
              reset('ban', (s) => omit(s, 'banFailedAddress'))
            })}
          </div>
        </div>

        <div className="dh-field">
          <label htmlFor="sdk-logs">{t`SDK log level`}</label>
          <div className="flex gap-2">
            <select
              id="sdk-logs"
              className="dh-select flex-1"
              value={draft.logs}
              onChange={(e) => {
                set('logs', e.target.value as SdkLogLevel)
              }}
            >
              {SDK_LOG_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
            {resetButton('logs', () => {
              reset('logs', (s) => omit(s, 'logLevel'))
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="dh-btn" disabled={!dirty}>
            {t`Apply and restart the SDK`}
          </button>
          {applied ? (
            <p role="status" data-connection-applied className="text-[var(--dh-ink-2)]">
              {t`Applied. The Platform SDK restarted.`}
            </p>
          ) : null}
        </div>
      </form>
    </Card>
  )
}
