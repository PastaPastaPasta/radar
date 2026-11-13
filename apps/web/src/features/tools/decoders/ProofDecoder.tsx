import { useLingui } from '@lingui/react/macro'
import { useEffect, useMemo, useState } from 'react'
import { formatInt } from '@/lib/format'
import { Card, Copy, Empty, KeyValue, Skeleton } from '@/ui'
import { BytesField, useParsedBytes, type BytesState } from './BytesField'
import { contextLabel, decodeGroveKey } from './grovedb-schema'
import { parseGroveProof, ProofParseError, type ProofParseReason } from './grove-proof'
import {
  flattenLayers,
  parseProofTree,
  summarizeProof,
  type OpNode,
  type ParsedLayer,
} from './parse-proof-tree'

type Outcome =
  | { status: 'ok'; text: string; root: ParsedLayer | null }
  | { status: 'error'; reason: ProofParseReason }

type Parsed = { status: 'idle' } | { status: 'pending' } | Outcome

const MAX_OPS_SHOWN = 200

function shortHash(hash: string): string {
  return hash.length > 20 ? `${hash.slice(0, 10)}…${hash.slice(-6)}` : hash
}

/** Each layer's place in the tree, from the keys that opened the layers above it. */
function layerPaths(layers: ParsedLayer[]): string[] {
  const stack: string[] = []
  return layers.map((layer) => {
    stack.length = layer.depth
    if (layer.depth > 0) stack[layer.depth - 1] = layer.decodedParentKey?.name ?? layer.parentKey
    return stack.length === 0 ? '/' : `/ ${stack.join(' / ')}`
  })
}

function OpRow({ op, layer }: { op: OpNode; layer: ParsedLayer }) {
  const key = op.key === undefined ? undefined : decodeGroveKey(op.key, layer.context)
  return (
    <tr>
      <td className="rx-mono">{op.index}</td>
      <td className="rx-mono">{op.variant ?? op.combine ?? op.kind}</td>
      <td className="rx-mono break-all">
        {op.key === undefined ? null : op.key === '' ? '·' : op.key}
        {key?.name ? <span className="text-[var(--dh-ink-2)]"> {key.name}</span> : null}
      </td>
      <td className="rx-mono break-all">{op.value ?? op.treeValue ?? ''}</td>
      <td className="rx-mono" title={op.hash}>
        {op.hash ? shortHash(op.hash) : ''}
      </td>
      <td className="rx-mono">
        {[op.count !== undefined ? `n ${op.count}` : '', op.sum !== undefined ? `Σ ${op.sum}` : '']
          .filter(Boolean)
          .join(' ')}
      </td>
    </tr>
  )
}

function LayerDetails({ layer, path }: { layer: ParsedLayer; path: string }) {
  const { t } = useLingui()
  const [all, setAll] = useState(false)
  const shown = all ? layer.ops : layer.ops.slice(0, MAX_OPS_SHOWN)
  return (
    <details
      className="rounded-[var(--dh-r2)] border border-[var(--dh-line)] p-3"
      data-proof-layer={layer.layerIndex}
    >
      <summary className="cursor-pointer">
        <span className="font-medium">{t`Layer ${layer.layerIndex}`}</span>{' '}
        <span className="rx-mono text-[var(--dh-ink-2)] break-all">{path}</span>{' '}
        <span className="text-sm text-[var(--dh-ink-2)]">{t`${formatInt(layer.ops.length)} steps`}</span>
      </summary>
      <div className="mt-2 grid gap-2">
        <p className="text-sm text-[var(--dh-ink-2)]">{contextLabel(layer.context)}</p>
        <div className="overflow-x-auto">
          <table className="rx-mono w-full text-left text-sm">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">{t`Step`}</th>
                <th scope="col">{t`Key`}</th>
                <th scope="col">{t`Value`}</th>
                <th scope="col">{t`Hash`}</th>
                <th scope="col">{t`Count and sum`}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((op) => (
                <OpRow key={op.index} op={op} layer={layer} />
              ))}
            </tbody>
          </table>
        </div>
        {!all && layer.ops.length > MAX_OPS_SHOWN ? (
          <button
            type="button"
            className="dh-btn dh-btn--sm justify-self-start"
            onClick={() => {
              setAll(true)
            }}
          >
            {t`Show all ${formatInt(layer.ops.length)} steps`}
          </button>
        ) : null}
        {layer.issues.length > 0 ? (
          <p className="text-sm">{t`${layer.issues.length} lines of this layer could not be read.`}</p>
        ) : null}
      </div>
    </details>
  )
}

export function ProofDecoder() {
  const { t } = useLingui()
  const [state, setState] = useState<BytesState>({ text: '', choice: 'auto' })
  const bytes = useParsedBytes(state)
  const [finished, setFinished] = useState<{ bytes: Uint8Array; outcome: Outcome } | undefined>()
  const bytesNow = bytes?.ok ? bytes.bytes : undefined

  useEffect(() => {
    if (!bytesNow) return
    let live = true
    const done = (outcome: Outcome) => {
      if (live) setFinished({ bytes: bytesNow, outcome })
    }
    parseGroveProof(bytesNow).then(
      (text) => {
        done({ status: 'ok', text, root: parseProofTree(text) })
      },
      (error: unknown) => {
        done({
          status: 'error',
          reason: error instanceof ProofParseError ? error.reason : 'invalid',
        })
      },
    )
    return () => {
      live = false
    }
  }, [bytesNow])

  const parsed = useMemo<Parsed>(
    () =>
      !bytesNow
        ? { status: 'idle' }
        : finished?.bytes === bytesNow
          ? finished.outcome
          : { status: 'pending' },
    [bytesNow, finished],
  )

  const layers = useMemo(
    () => (parsed.status === 'ok' && parsed.root ? flattenLayers(parsed.root) : []),
    [parsed],
  )
  const paths = useMemo(() => layerPaths(layers), [layers])
  const summary = useMemo(
    () => (parsed.status === 'ok' ? summarizeProof(parsed.root) : undefined),
    [parsed],
  )
  const reasons: Record<ProofParseReason, string> = {
    empty: t`Paste a proof.`,
    load: t`The proof reader could not be loaded. Check the connection and try again.`,
    trap: t`The proof reader stopped on this input: it is larger or deeper than it can read.`,
    truncated: t`This proof ends before it should: some of its bytes are missing.`,
    invalid: t`These bytes are not a GroveDB proof.`,
  }

  return (
    <div className="grid gap-4">
      <Card title={t`GroveDB proof`} layer="platform">
        <BytesField
          state={state}
          onChange={setState}
          parsed={bytes}
          label={t`Proof bytes`}
          hint={t`The grovedbProof of an answer from Platform. Radar reads it here and shows what each layer proves.`}
        />
      </Card>
      {parsed.status === 'pending' ? <Skeleton shape="row" count={3} /> : null}
      {parsed.status === 'error' ? (
        <div
          role="alert"
          data-decode-error
          className="rounded-[var(--dh-r2)] border border-[var(--dh-bad)] p-3"
        >
          <p className="font-semibold">{reasons[parsed.reason]}</p>
        </div>
      ) : null}
      {parsed.status === 'ok' && !parsed.root ? (
        <Empty
          kind="no-match"
          title={t`Nothing in this proof could be read as layers.`}
          body={t`The raw reading is below.`}
        />
      ) : null}
      {summary && summary.layers.length > 0 ? (
        <Card title={t`What the proof contains`} layer="platform" id="proof-summary">
          <div className="grid gap-4">
            <KeyValue
              columns={3}
              items={[
                { label: t`Layers`, value: formatInt(summary.layers.length) },
                { label: t`Proven items`, value: formatInt(summary.totals.kv) },
                { label: t`Subtrees entered`, value: formatInt(summary.totals.kvValueHash) },
                {
                  label: t`Hashes standing in for the rest`,
                  value: formatInt(summary.totals.kvHash + summary.totals.hash),
                },
                { label: t`Steps`, value: formatInt(layers.reduce((n, l) => n + l.ops.length, 0)) },
              ]}
            />
            <div className="grid gap-2" data-proof-layers>
              {layers.map((layer, i) => (
                <LayerDetails key={layer.layerIndex} layer={layer} path={paths[i]!} />
              ))}
            </div>
          </div>
        </Card>
      ) : null}
      {parsed.status === 'ok' ? (
        <Card title={t`Raw reading`} layer="platform" id="proof-raw">
          <div className="grid gap-2">
            <div>
              <Copy value={parsed.text} label={t`Copy the raw reading`} />
            </div>
            <textarea
              className="dh-input rx-mono text-sm"
              rows={14}
              readOnly
              aria-label={t`Raw reading`}
              value={parsed.text}
            />
          </div>
        </Card>
      ) : null}
    </div>
  )
}
