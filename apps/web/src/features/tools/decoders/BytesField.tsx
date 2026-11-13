import { useLingui } from '@lingui/react/macro'
import { useId, useMemo } from 'react'
import { formatBytes } from '@/lib/format'
import { parseBytes, type ByteFormat, type ByteFormatChoice, type ParsedBytes } from './bytes'

const CHOICES: ByteFormatChoice[] = ['auto', 'hex', 'base64', 'bytes']

export interface BytesState {
  text: string
  choice: ByteFormatChoice
}

/** What the pasted text parses to; undefined while the box is empty. */
export function useParsedBytes(state: BytesState): ParsedBytes | undefined {
  return useMemo(
    () => (state.text.trim() === '' ? undefined : parseBytes(state.text, state.choice)),
    [state.text, state.choice],
  )
}

export function BytesField({
  state,
  onChange,
  parsed,
  label,
  hint,
  rows = 5,
}: {
  state: BytesState
  onChange: (next: BytesState) => void
  parsed: ParsedBytes | undefined
  label: string
  hint?: string
  rows?: number
}) {
  const { t } = useLingui()
  const ids = { text: useId(), format: useId(), note: useId() }
  const names: Record<ByteFormatChoice, string> = {
    auto: t`Detect`,
    hex: t`Hex`,
    base64: t`Base64`,
    bytes: t`Byte list`,
  }
  const formatName: Record<ByteFormat, string> = {
    hex: t`Hex`,
    base64: t`Base64`,
    bytes: t`Byte list`,
  }
  const problem = parsed && !parsed.ok ? parsed.reason : undefined
  const reasons = {
    empty: t`Paste some bytes.`,
    hex: t`That isn't hex: use the digits 0 to 9 and a to f, two to a byte.`,
    base64: t`That isn't hex, base64 or a list of numbers.`,
    bytes: t`That isn't a list of numbers from 0 to 255.`,
    'too-large': t`That is more than 1 MB, which is more than any of these objects.`,
  }
  return (
    <div className="grid gap-2" data-bytes-field>
      <label htmlFor={ids.text} className="font-medium">
        {label}
      </label>
      {hint ? <p className="text-sm text-[var(--dh-ink-2)]">{hint}</p> : null}
      <textarea
        id={ids.text}
        className="dh-input rx-mono"
        rows={rows}
        spellCheck={false}
        autoComplete="off"
        autoCapitalize="off"
        value={state.text}
        aria-invalid={problem ? true : undefined}
        aria-describedby={ids.note}
        onChange={(e) => {
          onChange({ ...state, text: e.target.value })
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={ids.format} className="text-sm text-[var(--dh-ink-2)]">
          {t`Read as`}
        </label>
        <select
          id={ids.format}
          className="dh-input"
          value={state.choice}
          onChange={(e) => {
            onChange({ ...state, choice: e.target.value as ByteFormatChoice })
          }}
        >
          {CHOICES.map((c) => (
            <option key={c} value={c}>
              {names[c]}
            </option>
          ))}
        </select>
        <p id={ids.note} className="text-sm" data-bytes-note role={problem ? 'alert' : undefined}>
          {parsed?.ok
            ? t`${formatName[parsed.format]}, ${formatBytes(parsed.bytes.length)}. Decoded here: the bytes are not sent anywhere.`
            : problem
              ? reasons[problem]
              : t`Decoded here: the bytes are not sent anywhere.`}
        </p>
      </div>
    </div>
  )
}
