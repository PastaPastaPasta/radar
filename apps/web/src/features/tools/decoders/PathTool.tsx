import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useId, useState } from 'react'
import { sdkQueries } from '@/data/sdk/queries'
import type { PathElementDto } from '@/data/sdk/methods/tools'
import { useNetwork } from '@/features/entity'
import { isHex } from '@/lib/hex'
import { Card, Empty, ErrorState, JsonView, Skeleton } from '@/ui'
import { decodeGroveKey, type GroveContext } from './grovedb-schema'
import { PATH_PRESETS, presetById } from './path-presets'

const lines = (text: string): string[] =>
  text
    .split(/[\s,]+/)
    .map((s) => s.trim().replace(/^0x/i, ''))
    .filter((s) => s !== '')

const MAX_KEYS = 32

function ElementRow({ element, context }: { element: PathElementDto; context: GroveContext }) {
  const { t } = useLingui()
  const name = decodeGroveKey(`0x${element.key}`, context).name
  return (
    <tr data-path-element={element.key}>
      <td className="rx-mono break-all">
        {element.key}
        {name ? <span className="text-[var(--dh-ink-2)]"> {name}</span> : null}
      </td>
      <td className="rx-mono">{element.elementType ?? t`nothing stored`}</td>
      <td className="rx-mono break-all">{element.value ?? ''}</td>
      <td className="rx-mono">{element.sum === null ? '' : element.sum.toString()}</td>
      <td className="rx-mono break-all">{element.referenceTarget?.join(' / ') ?? ''}</td>
    </tr>
  )
}

/** Reads elements at a GroveDB path; the SDK checks the proof and the keys are named from what each tree is known to hold. */
export function PathTool({ preset }: { preset: string | undefined }) {
  const { t, i18n } = useLingui()
  const net = useNetwork()
  const navigate = useNavigate()
  const ids = { preset: useId(), path: useId(), keys: useId() }
  const start = presetById(preset)
  const [pathText, setPathText] = useState((start?.path ?? []).join('\n'))
  const [keysText, setKeysText] = useState((start?.keys ?? []).join('\n'))
  const [context, setContext] = useState<GroveContext>(start?.context ?? 'root')
  const [request, setRequest] = useState<{ path: string[]; keys: string[] } | undefined>(
    start ? { path: start.path, keys: start.keys } : undefined,
  )

  const path = lines(pathText)
  const keys = lines(keysText)
  const problem = ((): string | undefined => {
    if (path.concat(keys).some((s) => !isHex(s)))
      return t`Every segment and key is hex, two digits to a byte.`
    if (keys.length === 0) return t`Name at least one key to read.`
    if (keys.length > MAX_KEYS) return t`Read up to ${MAX_KEYS} keys at a time.`
    return undefined
  })()

  const query = useQuery({
    ...sdkQueries['system.pathElements'](net, request ?? { path: [], keys: [] }),
    enabled: request !== undefined,
  })

  const choose = (id: string) => {
    const next = presetById(id)
    void navigate({
      to: '/tools/$decoder',
      params: { decoder: 'path' },
      search: ((prev: Record<string, unknown>) => ({ ...prev, preset: next?.id })) as never,
      replace: true,
      resetScroll: false,
    })
    if (!next) return
    setPathText(next.path.join('\n'))
    setKeysText(next.keys.join('\n'))
    setContext(next.context)
    setRequest({ path: next.path, keys: next.keys })
  }

  return (
    <div className="grid gap-4">
      <Card title={t`GroveDB path`} layer="platform">
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (problem) return
            setRequest({ path, keys })
          }}
        >
          <div className="grid gap-1">
            <label htmlFor={ids.preset} className="font-medium">
              {t`Preset`}
            </label>
            <select
              id={ids.preset}
              className="dh-input"
              value={presetById(preset)?.id ?? ''}
              onChange={(e) => {
                choose(e.target.value)
              }}
            >
              <option value="">{t`Custom`}</option>
              {PATH_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {i18n._(p.title)}
                </option>
              ))}
            </select>
            {presetById(preset) ? (
              <p className="text-sm text-[var(--dh-ink-2)]">{i18n._(presetById(preset)!.about)}</p>
            ) : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1">
              <label htmlFor={ids.path} className="font-medium">
                {t`Path`}
              </label>
              <p className="text-sm text-[var(--dh-ink-2)]">
                {t`One hex segment per line, from the root. Empty reads the root tree.`}
              </p>
              <textarea
                id={ids.path}
                className="dh-input rx-mono"
                rows={4}
                spellCheck={false}
                value={pathText}
                onChange={(e) => {
                  setPathText(e.target.value)
                }}
              />
            </div>
            <div className="grid gap-1">
              <label htmlFor={ids.keys} className="font-medium">
                {t`Keys`}
              </label>
              <p className="text-sm text-[var(--dh-ink-2)]">{t`One hex key per line.`}</p>
              <textarea
                id={ids.keys}
                className="dh-input rx-mono"
                rows={4}
                spellCheck={false}
                value={keysText}
                onChange={(e) => {
                  setKeysText(e.target.value)
                  setContext('unknown')
                }}
              />
            </div>
          </div>
          {problem && (pathText || keysText) ? (
            <p role="alert" className="text-sm" data-path-problem>
              {problem}
            </p>
          ) : null}
          <div>
            <button
              type="submit"
              className="dh-btn dh-btn--primary"
              disabled={problem !== undefined}
            >
              {t`Read elements`}
            </button>
          </div>
        </form>
      </Card>
      {request ? (
        <Card
          title={t`Elements`}
          layer="platform"
          {...(query.data ? { source: query.data } : {})}
          state={query.isPending ? 'loading' : 'ready'}
          id="path-elements"
        >
          {query.isPending ? <Skeleton shape="row" count={3} /> : null}
          {query.isError ? (
            <ErrorState
              error={query.error}
              source="sdk"
              onRetry={() => {
                void query.refetch()
              }}
            />
          ) : null}
          {query.data?.data.length === 0 ? (
            <Empty kind="none-yet" title={t`Nothing was returned for these keys.`} />
          ) : null}
          {query.data && query.data.data.length > 0 ? (
            <div className="grid gap-3">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr>
                      <th scope="col">{t`Key`}</th>
                      <th scope="col">{t`Element`}</th>
                      <th scope="col">{t`Value`}</th>
                      <th scope="col">{t`Sum`}</th>
                      <th scope="col">{t`Points to`}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {query.data.data.map((element) => (
                      <ElementRow key={element.key} element={element} context={context} />
                    ))}
                  </tbody>
                </table>
              </div>
              <JsonView value={query.data.data} collapsedDepth={0} label={t`Raw result`} />
            </div>
          ) : null}
        </Card>
      ) : null}
    </div>
  )
}
