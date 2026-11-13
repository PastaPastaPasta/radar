import { useLingui } from '@lingui/react/macro'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { PageFrame, PageLink } from '@/features/entity'
import { Badge, Card, Empty } from '@/ui'
import { filterRows, referenceRows, sourceName } from './reference'

const SDK_DOCS = 'https://www.npmjs.com/package/@dashevo/evo-sdk'

export function SdkReferencePage() {
  const { t } = useLingui()
  const search = useSearch({ from: '/sdk-reference' })
  const navigate = useNavigate()
  const [text, setText] = useState(search.q ?? '')
  const rows = useMemo(() => referenceRows(), [])
  const shown = useMemo(() => filterRows(rows, search.q), [rows, search.q])

  const setQuery = (value: string) => {
    setText(value)
    void navigate({
      to: '/sdk-reference',
      search: ((prev: Record<string, unknown>) => ({
        ...prev,
        q: value.trim() || undefined,
      })) as never,
      replace: true,
      resetScroll: false,
    })
  }

  return (
    <PageFrame
      path="/sdk-reference"
      title={t`SDK reference`}
      eyebrow={t`Tools`}
      layer="neutral"
      lede={t`Which Platform SDK call backs each Radar page, with its arguments.`}
      actions={
        <a className="dh-btn dh-btn--sm" href={SDK_DOCS} target="_blank" rel="noopener noreferrer">
          {t`SDK documentation`}
          <span className="dh-sr"> {t`(opens in a new tab)`}</span>
        </a>
      }
    >
      <Card title={t`Pages`} layer="neutral" id="sdk-pages">
        <div className="grid gap-4">
          <div className="grid gap-1">
            <label htmlFor="sdk-ref-filter" className="font-medium">
              {t`Filter by page, source or call`}
            </label>
            <input
              id="sdk-ref-filter"
              type="search"
              className="dh-input"
              autoComplete="off"
              value={text}
              onChange={(e) => {
                setQuery(e.target.value)
              }}
            />
          </div>
          {shown.length === 0 ? (
            <Empty
              kind="no-match"
              title={t`No page or call matches this filter.`}
              action={
                <button
                  type="button"
                  className="dh-btn"
                  onClick={() => {
                    setQuery('')
                  }}
                >
                  {t`Clear the filter`}
                </button>
              }
            />
          ) : (
            <ul className="grid gap-4" data-sdk-pages>
              {shown.map((row) => (
                <li
                  key={row.path}
                  className="grid gap-2 border-b border-[var(--dh-line)] pb-4"
                  data-sdk-page={row.path}
                >
                  <div className="flex flex-wrap items-baseline gap-2">
                    {row.linkable ? (
                      <PageLink to={row.path} className="font-semibold">
                        {row.title}
                      </PageLink>
                    ) : (
                      <span className="font-semibold">{row.title}</span>
                    )}
                    <span className="rx-mono text-sm text-[var(--dh-ink-2)]">{row.path}</span>
                  </div>
                  <p className="text-sm text-[var(--dh-ink-2)]">{row.summary}</p>
                  <div className="flex flex-wrap gap-1">
                    {row.sources.map((s) => (
                      <Badge key={s}>{sourceName(s)}</Badge>
                    ))}
                  </div>
                  {row.calls.length > 0 ? (
                    <dl className="grid gap-1 text-sm">
                      {row.calls.map((c) => (
                        <div key={c.method} className="grid gap-0.5">
                          <dt className="rx-mono font-medium">{c.method}</dt>
                          <dd className="rx-mono break-words text-[var(--dh-ink-2)]">
                            sdk.{c.call}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </PageFrame>
  )
}
