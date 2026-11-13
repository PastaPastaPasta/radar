import { useLingui } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { useState, useSyncExternalStore } from 'react'
import { PAGE_SDK_VERSION, sdk } from '@/data/sdk/client'
import { useNetwork } from '@/features/entity'
import { announce, Badge, Card, KeyValue } from '@/ui'
import { setDevFlag, useDevFlags, type DevFlags } from '../dev-flags'
import { openDiagnostics, openProofList } from '../panels'
import { clearSdkCache } from './sdk-cache'

function useSdkInfo(net: ReturnType<typeof useNetwork>) {
  return useSyncExternalStore(
    (cb) => sdk.subscribe(cb),
    () => sdk.info(net),
    () => undefined,
  )
}

function Shortcut({ keys }: { keys: string[] }) {
  return (
    <span className="inline-flex gap-1">
      {keys.map((k) => (
        <kbd key={k} className="rounded border px-1.5 text-sm">
          {k}
        </kbd>
      ))}
    </span>
  )
}

function PanelRow({
  flag,
  keys,
  title,
  shortcutLabel,
  body,
  open,
  openLabel,
}: {
  flag: keyof DevFlags
  keys: string[]
  title: string
  shortcutLabel: string
  body: string
  open: () => void
  openLabel: string
}) {
  const flags = useDevFlags()
  const id = `dev-${flag}`
  return (
    <div className="grid gap-2 border-b border-[var(--dh-line)] pb-4 last:border-b-0 last:pb-0">
      <h3 className="font-semibold">{title}</h3>
      <p className="text-[var(--dh-ink-2)]">{body}</p>
      <label className="flex flex-wrap items-center gap-2" htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          checked={flags[flag]}
          onChange={(e) => {
            setDevFlag(flag, e.target.checked)
          }}
        />
        {shortcutLabel} <Shortcut keys={keys} />
      </label>
      <p>
        <button type="button" className="dh-btn dh-btn--sm" onClick={open}>
          {openLabel}
        </button>
      </p>
    </div>
  )
}

export function DeveloperCard() {
  const { t } = useLingui()
  const net = useNetwork()
  const client = useQueryClient()
  const info = useSdkInfo(net)
  const [cleared, setCleared] = useState(false)
  const mismatch =
    info !== undefined && info.sdkVersion !== PAGE_SDK_VERSION && info.sdkVersion !== 'fixture'
  const workerVersion = info?.sdkVersion ?? t`not connected yet`
  const protocol = info?.protocolVersion

  return (
    <Card
      id="developer"
      title={t`Developer`}
      subtitle={t`Tools for checking what Radar asked and what it was told.`}
    >
      <div className="grid gap-4">
        <PanelRow
          flag="proofShortcut"
          keys={['Alt', 'Shift', 'P']}
          title={t`Proof inspector`}
          shortcutLabel={t`Open the proof inspector with the keyboard`}
          body={t`Every “Proof-checked” mark opens it. It shows the call, the node, the Platform height, the quorum and the proof bytes, and exports them as evidence.`}
          open={() => {
            openProofList()
          }}
          openLabel={t`Open the proof inspector`}
        />
        <PanelRow
          flag="diagnosticsShortcut"
          keys={['Alt', 'Shift', 'D']}
          title={t`Diagnostics`}
          shortcutLabel={t`Open diagnostics with the keyboard`}
          body={t`The last 100 requests this tab made, with the source, the node, how long each took and whether Decentralized only mode refused it.`}
          open={() => {
            openDiagnostics()
          }}
          openLabel={t`Open diagnostics`}
        />

        <div className="grid gap-2">
          <h3 className="font-semibold">{t`Platform SDK cache`}</h3>
          <p className="text-[var(--dh-ink-2)]">
            {t`Forgets every answer the Platform SDK gave, here and in this browser’s storage, and the proofs held for the inspector. Pages read it again as you open them.`}
          </p>
          <p className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="dh-btn dh-btn--sm"
              onClick={() => {
                void clearSdkCache(client).then(() => {
                  setCleared(true)
                  announce(t`Platform SDK cache cleared`)
                })
              }}
            >
              {t`Clear the SDK cache`}
            </button>
            {cleared ? (
              <span role="status" data-sdk-cache-cleared className="text-[var(--dh-ink-2)]">
                {t`Cleared.`}
              </span>
            ) : null}
          </p>
        </div>

        <div className="grid gap-2" id="build">
          <h3 className="font-semibold">{t`Build`}</h3>
          <KeyValue
            items={[
              { label: t`Radar`, value: <code>{__APP_VERSION__}</code> },
              { label: t`Platform SDK in this page`, value: <code>{PAGE_SDK_VERSION}</code> },
              { label: t`Platform SDK in the worker`, value: <code>{workerVersion}</code> },
              { label: t`Wasm bindings`, value: <code>@dashevo/wasm-sdk {PAGE_SDK_VERSION}</code> },
              {
                label: t`Platform protocol version`,
                value: protocol ?? '—',
              },
            ]}
          />
          {mismatch ? (
            <p role="alert" className="flex flex-wrap items-center gap-2" data-sdk-mismatch>
              <Badge tone="warning">{t`Version mismatch`}</Badge>
              <span>
                {t`The worker runs SDK ${workerVersion} but this page was built with ${PAGE_SDK_VERSION}. Reload the page; if it stays, clear this site’s data.`}
              </span>
            </p>
          ) : null}
        </div>
      </div>
    </Card>
  )
}
