import { useLingui } from '@lingui/react/macro'
import { useMemo, useState, useSyncExternalStore } from 'react'
import { queryLog, type QueryLogEntry } from '@/data/query-log'
import { formatInt } from '@/lib/format'
import { announce, Badge, Empty, SegFilter, Time } from '@/ui'
import { copyText } from '@/ui/clipboard'
import { closePanel, panelsState, subscribePanels } from '../panels'
import { Sheet } from '../Sheet'

const ALL = 'all'

const subscribeLog = (cb: () => void) => queryLog.subscribe(cb)
const snapshotLog = () => queryLog.snapshot()

function useLog(): readonly QueryLogEntry[] {
  return useSyncExternalStore(subscribeLog, snapshotLog, snapshotLog)
}

function Status({ entry }: { entry: QueryLogEntry }) {
  const { t } = useLingui()
  if (entry.refusedByMode) return <Badge tone="info">{t`Refused by mode`}</Badge>
  if (entry.ok) return <Badge tone="success">{t`OK`}</Badge>
  return <Badge tone="danger">{entry.kind ?? t`Failed`}</Badge>
}

/** The requests this tab made, newest first. Mounted once by the shell on first use. */
export function Diagnostics() {
  const { t } = useLingui()
  const open = useSyncExternalStore(subscribePanels, panelsState, panelsState).diagnostics.open
  const log = useLog()
  const [source, setSource] = useState(ALL)
  const [failuresOnly, setFailuresOnly] = useState(false)

  const sources = useMemo(() => [...new Set(log.map((e) => e.source))].sort(), [log])
  const shown = useMemo(
    () =>
      log
        .filter((e) => (source === ALL || e.source === source) && (!failuresOnly || !e.ok))
        .reverse(),
    [log, source, failuresOnly],
  )

  const copy = () => {
    void copyText(JSON.stringify(shown, null, 2)).then((ok) => {
      if (ok) announce(t`Log copied`)
    })
  }

  return (
    <Sheet
      open={open}
      onClose={() => {
        closePanel('diagnostics')
      }}
      testId="diagnostics"
      title={t`Diagnostics`}
      description={t`The last ${formatInt(log.length)} requests this tab made. Nothing here is sent anywhere.`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <SegFilter
          label={t`Source`}
          value={source}
          onChange={setSource}
          options={[{ id: ALL, label: t`All` }, ...sources.map((s) => ({ id: s, label: s }))]}
        />
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={failuresOnly}
            onChange={(e) => {
              setFailuresOnly(e.target.checked)
            }}
          />
          {t`Failures only`}
        </label>
        <span className="ms-auto flex gap-2">
          <button
            type="button"
            className="dh-btn dh-btn--sm"
            onClick={copy}
            disabled={shown.length === 0}
          >
            {t`Copy as JSON`}
          </button>
          <button
            type="button"
            className="dh-btn dh-btn--sm dh-btn--destructive"
            onClick={() => {
              queryLog.clear()
            }}
            disabled={log.length === 0}
          >
            {t`Clear`}
          </button>
        </span>
      </div>
      {shown.length === 0 ? (
        <Empty
          kind={log.length === 0 ? 'none-yet' : 'no-match'}
          title={log.length === 0 ? t`No requests yet` : t`No requests match`}
          body={
            log.length === 0
              ? t`Requests appear here as pages load.`
              : t`Change the source or the failures filter.`
          }
        />
      ) : (
        <table className="w-full text-sm max-md:block" data-diagnostics-log>
          <caption className="sr-only">{t`Requests this tab made, newest first`}</caption>
          <thead className="max-md:sr-only">
            <tr className="text-start text-[var(--dh-ink-2)]">
              <th className="py-1 pe-2 text-start font-medium">{t`When`}</th>
              <th className="py-1 pe-2 text-start font-medium">{t`Network`}</th>
              <th className="py-1 pe-2 text-start font-medium">{t`Source`}</th>
              <th className="py-1 pe-2 text-start font-medium">{t`Request`}</th>
              <th className="py-1 pe-2 text-start font-medium">{t`Result`}</th>
              <th className="py-1 pe-2 text-end font-medium">{t`Took`}</th>
              <th className="py-1 pe-2 text-start font-medium">{t`Node`}</th>
              <th className="py-1 text-start font-medium">{t`Proof-checked`}</th>
            </tr>
          </thead>
          <tbody className="max-md:block">
            {shown.map((e) => (
              <tr
                key={e.id}
                data-source={e.source}
                data-ok={e.ok}
                className="border-t border-[var(--dh-line)] align-top max-md:grid max-md:grid-cols-2 max-md:gap-x-3 max-md:gap-y-1 max-md:py-2"
              >
                <td className="py-1 pe-2 max-md:block">
                  <Time ms={e.at} mode="absolute" seconds />
                </td>
                <td className="py-1 pe-2 max-md:block">{e.net}</td>
                <td className="py-1 pe-2 max-md:block">
                  <code>{e.source}</code>
                </td>
                <td className="py-1 pe-2 break-all max-md:col-span-2 max-md:block">
                  <code>{e.what}</code>
                </td>
                <td className="py-1 pe-2 max-md:block">
                  <Status entry={e} />
                </td>
                <td className="py-1 pe-2 text-end tabular-nums max-md:block max-md:text-start">
                  {formatInt(e.tookMs)} ms
                </td>
                <td className="py-1 pe-2 break-all max-md:block">{e.node ?? '—'}</td>
                <td className="py-1 max-md:block">{e.proved ? t`Yes` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Sheet>
  )
}
