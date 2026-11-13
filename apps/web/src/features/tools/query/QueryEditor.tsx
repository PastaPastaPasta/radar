import { useLingui } from '@lingui/react/macro'
import { useId, useMemo, useRef, type KeyboardEvent, type UIEvent } from 'react'
import { highlightSql, type SqlTokenKind } from './highlight'

const TOKEN_CLASS: Record<SqlTokenKind, string> = {
  keyword: 'font-semibold text-[var(--dh-brand-ink)]',
  string: 'text-[var(--dh-good)]',
  number: 'text-[var(--dh-warn)]',
  comment: 'italic text-[var(--dh-ink-3)]',
  identifier: 'text-[var(--dh-ink)]',
  plain: '',
}

const LINE_HEIGHT = '1.5rem'
const SHARED =
  'font-[family-name:var(--dh-mono)] text-[length:var(--dh-fs-sm)] leading-6 whitespace-pre p-3 m-0'

export interface QueryEditorProps {
  value: string
  onChange: (value: string) => void
  /** ⌘/Ctrl+Enter. */
  onRun: () => void
  /** Describes the editor to assistive technology. */
  label: string
  errorId?: string
  invalid?: boolean
}

/** A plain textarea over a coloured copy of its text, with line numbers, so nothing but the browser edits the SQL. */
export function QueryEditor({ value, onChange, onRun, label, errorId, invalid }: QueryEditorProps) {
  const { t } = useLingui()
  const hintId = useId()
  const gutter = useRef<HTMLDivElement>(null)
  const colours = useRef<HTMLPreElement>(null)
  const tokens = useMemo(() => highlightSql(value), [value])
  const lines = value.split('\n').length

  const sync = (e: UIEvent<HTMLTextAreaElement>) => {
    const { scrollTop, scrollLeft } = e.currentTarget
    if (gutter.current) gutter.current.scrollTop = scrollTop
    if (colours.current) {
      colours.current.scrollTop = scrollTop
      colours.current.scrollLeft = scrollLeft
    }
  }

  const keyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      onRun()
    }
  }

  return (
    <div className="grid gap-1">
      <div
        data-query-editor
        className="grid min-h-48 grid-cols-[auto_minmax(0,1fr)] overflow-hidden rounded-[var(--dh-r2)] border border-[var(--dh-line)] bg-[var(--dh-sunken)] focus-within:outline focus-within:outline-2 focus-within:outline-[var(--dh-focus)]"
      >
        <div
          ref={gutter}
          aria-hidden="true"
          data-query-gutter
          className={`${SHARED} select-none overflow-hidden border-r border-[var(--dh-line)] text-right text-[var(--dh-ink-2)]`}
          style={{ lineHeight: LINE_HEIGHT }}
        >
          {Array.from({ length: lines }, (_, i) => i + 1).join('\n')}
        </div>
        <div className="relative min-w-0">
          <pre
            ref={colours}
            aria-hidden="true"
            data-query-colours
            className={`${SHARED} pointer-events-none absolute inset-0 overflow-hidden`}
            style={{ lineHeight: LINE_HEIGHT }}
          >
            {tokens.map((tok, i) => (
              <span key={i} className={TOKEN_CLASS[tok.kind]}>
                {tok.text}
              </span>
            ))}
            {'\n'}
          </pre>
          <textarea
            aria-label={label}
            aria-describedby={`${hintId}${errorId ? ` ${errorId}` : ''}`}
            aria-invalid={invalid ? true : undefined}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            wrap="off"
            value={value}
            onChange={(e) => {
              onChange(e.target.value)
            }}
            onKeyDown={keyDown}
            onScroll={sync}
            className={`${SHARED} relative block h-full min-h-48 w-full resize-y overflow-auto bg-transparent text-transparent caret-[var(--dh-ink)] outline-none selection:bg-[var(--dh-select-soft)] selection:text-transparent`}
            style={{ lineHeight: LINE_HEIGHT }}
          />
        </div>
      </div>
      <p id={hintId} className="text-sm text-[var(--dh-ink-2)]">
        {t`Press ⌘ or Ctrl and Enter to run. Up to two statements, separated by a semicolon.`}
      </p>
    </div>
  )
}
