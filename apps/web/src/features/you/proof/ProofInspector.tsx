import { plural } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import { useEffect, useSyncExternalStore } from 'react'
import { queryLog } from '@/data/query-log'
import { proofStore, type ProofRecord } from '@/data/sdk/proof-store'
import { formatInt } from '@/lib/format'
import { bytesToHex } from '@/lib/hex'
import { announce, Badge, Copy, Empty, JsonView, KeyValue, Time } from '@/ui'
import { registerProofInspector } from '@/ui/proof'
import { copyText } from '@/ui/clipboard'
import { closePanel, openProofFor, openProofList, panelsState, subscribePanels } from '../panels'
import { Sheet } from '../Sheet'
import { downloadText, evidenceFile, evidenceName, evidenceText } from './evidence'

const HEX_PREVIEW = 192

const subscribeProofs = (cb: () => void) => proofStore.subscribe(cb)
const snapshotProofs = () => proofStore.snapshot()
const subscribeLog = (cb: () => void) => queryLog.subscribe(cb)
const snapshotLog = () => queryLog.snapshot()

function useProofs(): ProofRecord[] {
  useSyncExternalStore(subscribeProofs, snapshotProofs, snapshotProofs)
  return proofStore.list()
}

function useFailedChecks() {
  const log = useSyncExternalStore(subscribeLog, snapshotLog, snapshotLog)
  return log.filter((e) => e.kind === 'proof-failed').reverse()
}

function exportEvidence(records: readonly ProofRecord[], scope: string): void {
  const now = Date.now()
  downloadText(evidenceName(scope, now), evidenceText(evidenceFile(records, now, __APP_VERSION__)))
}

function ProofDetail({ record }: { record: ProofRecord }) {
  const { t } = useLingui()
  const hex = bytesToHex(record.proof.grovedbProof)
  const preview = hex.length > HEX_PREVIEW ? `${hex.slice(0, HEX_PREVIEW)}…` : hex
  return (
    <div className="grid gap-4" data-proof-detail={record.id}>
      <p className="flex flex-wrap items-center gap-2">
        <Badge tone="success">{t`Verified`}</Badge>
        <span className="text-[var(--dh-ink-2)]">
          {t`The SDK checked this proof against the trusted quorum keys before Radar showed the figure.`}
        </span>
      </p>
      <KeyValue
        items={[
          { label: t`Call`, value: <code>{record.method}</code> },
          { label: t`Network`, value: record.net },
          { label: t`Asked`, value: <Time ms={record.recordedAt} mode="both" /> },
          { label: t`Answered by`, value: record.node ?? t`not reported` },
          { label: t`Platform height`, value: formatInt(record.meta.height) },
          { label: t`Platform time`, value: <Time ms={record.meta.timeMs} mode="both" /> },
          {
            label: t`Core chain-locked height`,
            value: formatInt(record.meta.coreChainLockedHeight),
          },
          { label: t`Epoch`, value: record.meta.epoch },
          { label: t`Protocol version`, value: record.meta.protocolVersion },
          { label: t`Chain`, value: record.meta.chainId },
          { label: t`Quorum type`, value: record.proof.quorumType },
          { label: t`Quorum`, value: <Copy value={bytesToHex(record.proof.quorumHash)} /> },
          { label: t`Round`, value: record.proof.round },
        ]}
      />
      <section className="grid gap-2" aria-label={t`Arguments`}>
        <h3 className="font-semibold">{t`Arguments`}</h3>
        <JsonView value={record.args} collapsedDepth={2} bytes="hex" />
      </section>
      <section className="grid gap-2" aria-label={t`Proof bytes`}>
        <h3 className="font-semibold">{t`Proof bytes`}</h3>
        <p className="text-[var(--dh-ink-2)]">
          {plural(record.proof.grovedbProof.length, {
            one: '# byte of GroveDB proof',
            other: '# bytes of GroveDB proof',
          })}
        </p>
        <code className="block max-h-32 overflow-auto rounded border border-[var(--dh-line)] p-2 text-xs break-all">
          {preview}
        </code>
        <p>
          <button
            type="button"
            className="dh-btn dh-btn--sm"
            onClick={() => {
              void copyText(hex).then((ok) => {
                if (ok) announce(t`Proof copied`)
              })
            }}
          >
            {t`Copy proof as hex`}
          </button>
        </p>
      </section>
    </div>
  )
}

function ProofList({ records }: { records: ProofRecord[] }) {
  const { t } = useLingui()
  const failed = useFailedChecks()
  return (
    <div className="grid gap-4">
      {failed.length > 0 ? (
        <section className="grid gap-2" aria-label={t`Proofs that did not verify`}>
          <h3 className="font-semibold">{t`Proofs that did not verify`}</h3>
          <ul className="grid gap-1">
            {failed.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-2">
                <Badge tone="danger">{t`Failed`}</Badge>
                <code>{e.what}</code>
                <Time ms={e.at} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {records.length === 0 ? (
        <Empty
          kind="none-yet"
          title={t`No proofs yet`}
          body={t`Open a page with a proof-checked figure. Radar keeps the last 300 proofs in memory until you close the tab.`}
        />
      ) : (
        <ul className="grid gap-1" aria-label={t`Proofs held`}>
          {records.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className="dh-btn dh-btn--quiet w-full justify-between gap-3 text-start"
                onClick={() => {
                  openProofFor(r)
                }}
              >
                <code>{r.method}</code>
                <span className="text-[var(--dh-ink-2)]">
                  {r.net} · #{formatInt(r.meta.height)}
                </span>
                <Time ms={r.recordedAt} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** The panel behind every proof-checked mark; mounted once by the shell on first use. */
export function ProofInspector() {
  const { t } = useLingui()
  const state = useSyncExternalStore(subscribePanels, panelsState, panelsState).proof
  const records = useProofs()

  useEffect(() => registerProofInspector(openProofFor), [])

  const selected = state.selected ? proofStore.get(state.selected) : undefined
  const exportable = selected ? [selected] : records
  const missing = state.selected !== undefined && !selected
  const count = records.length
  return (
    <Sheet
      open={state.open}
      onClose={() => {
        closePanel('proof')
      }}
      testId="proof"
      title={t`Proof inspector`}
      description={
        selected
          ? t`One figure’s proof, as Radar received it.`
          : t`Every proof this tab holds, newest first.`
      }
      actions={
        exportable.length > 0 ? (
          <button
            type="button"
            className="dh-btn dh-btn--sm"
            onClick={() => {
              exportEvidence(exportable, selected ? 'figure' : 'all')
            }}
          >
            {selected ? t`Export evidence` : t`Export all (${count})`}
          </button>
        ) : null
      }
    >
      {selected ? (
        <>
          <p>
            <button
              type="button"
              className="dh-btn dh-btn--quiet dh-btn--sm"
              onClick={() => {
                openProofList()
              }}
            >
              {t`All proofs`}
            </button>
          </p>
          <ProofDetail record={selected} />
        </>
      ) : missing ? (
        <Empty
          kind="not-found"
          title={t`This proof is no longer held`}
          body={t`Radar keeps the last 300 proofs. Load the figure again to get its proof.`}
          action={
            <button
              type="button"
              className="dh-btn dh-btn--sm"
              onClick={() => {
                openProofList()
              }}
            >
              {t`All proofs`}
            </button>
          }
        />
      ) : (
        <ProofList records={records} />
      )}
    </Sheet>
  )
}
