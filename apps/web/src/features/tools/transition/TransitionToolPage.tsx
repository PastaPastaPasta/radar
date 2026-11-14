import { useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useDecentralizedOnly } from '@/data/health'
import { endpoint } from '@/data/endpoints'
import { peQueries } from '@/data/pe'
import { Entity, PageFrame, useNetwork } from '@/features/entity'
import { formatInt } from '@/lib/format'
import {
  Card,
  Empty,
  ErrorState,
  Hash,
  JsonView,
  KeyValue,
  LinkOut,
  Skeleton,
  Unavailable,
} from '@/ui'
import { BytesField, useParsedBytes, type BytesState } from '../decoders/BytesField'
import { toBase64 } from '../decoders/bytes'
import { useDecoded } from '../decoders/use-decoded'
import {
  isDecodedTransition,
  summarizeTransition,
  type SummaryValue,
  type TransitionSummary,
} from './summary'

function ValueView({ value }: { value: SummaryValue }) {
  switch (value.kind) {
    case 'text':
      return <>{value.text}</>
    case 'number':
      return <span className="rx-mono">{formatInt(value.value)}</span>
    case 'id':
      return value.entity && value.entity !== 'masternode' ? (
        <Entity kind={value.entity} id={value.id} />
      ) : (
        <Hash value={value.id} display="wrap" />
      )
  }
}

function SummaryCard({ summary, actionType }: { summary: TransitionSummary; actionType: string }) {
  const { t, i18n } = useLingui()
  return (
    <Card
      title={i18n._(summary.label)}
      subtitle={<span className="rx-mono">{actionType}</span>}
      layer="platform"
      id="transition-summary"
    >
      <div className="grid gap-4">
        <KeyValue
          columns={2}
          items={summary.rows.map((row) => ({
            label: i18n._(row.label),
            value: <ValueView value={row.value} />,
          }))}
        />
        {summary.operations.length > 0 ? (
          <div className="overflow-x-auto" data-batch-operations>
            <table className="w-full text-left text-sm">
              <caption className="sr-only">{t`Operations in this batch`}</caption>
              <thead>
                <tr>
                  <th scope="col">{t`Action`}</th>
                  <th scope="col">{t`Type`}</th>
                  <th scope="col">{t`Contract`}</th>
                  <th scope="col">{t`ID`}</th>
                </tr>
              </thead>
              <tbody>
                {summary.operations.map((op, i) => (
                  <tr key={i}>
                    <td className="rx-mono">{op.action}</td>
                    <td className="rx-mono">{op.type ?? t`token`}</td>
                    <td>{op.contractId ? <Entity kind="contract" id={op.contractId} /> : null}</td>
                    <td>{op.id ? <Hash value={op.id} display="short" /> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </Card>
  )
}

function VerifyCard({ base64 }: { base64: string | undefined }) {
  const { t } = useLingui()
  const net = useNetwork()
  const decentralized = useDecentralizedOnly()
  const [asked, setAsked] = useState<string | undefined>()
  const supported = endpoint(net, 'pe') !== null
  const query = useQuery({
    ...peQueries.verifyTransaction(net, asked ?? ''),
    enabled: asked !== undefined && supported && !decentralized,
    gcTime: 0,
  })
  const current = asked !== undefined && asked === base64

  return (
    <Card
      title={t`Check with Platform`}
      layer="platform"
      {...(query.data && current ? { source: query.data } : {})}
      id="transition-verify"
    >
      <div className="grid gap-3">
        <p className="text-sm text-[var(--dh-ink-2)]">
          {t`Platform Explorer asks a Platform node whether it would accept this transition (a dry run). Nothing is broadcast and nothing changes.`}
        </p>
        {decentralized ? (
          <Unavailable
            source="pe"
            title={t`Checking a transition needs Platform Explorer`}
            compact
          />
        ) : !supported ? (
          <Empty
            kind="unsupported-network"
            title={t`Checking is not available on this network.`}
            body={t`Decoding above works on every network. Platform Explorer covers mainnet and testnet.`}
          />
        ) : (
          <>
            <div>
              <button
                type="button"
                className="dh-btn dh-btn--primary"
                disabled={base64 === undefined || query.isFetching}
                onClick={() => {
                  setAsked(base64)
                }}
              >
                {t`Check this transition`}
              </button>
            </div>
            {current && query.isFetching ? <Skeleton shape="row" count={1} /> : null}
            {current && query.isError ? (
              <ErrorState
                error={query.error}
                source="pe"
                onRetry={() => {
                  void query.refetch()
                }}
              />
            ) : null}
            {current && query.data ? <VerifyOutcome result={query.data.data} /> : null}
          </>
        )}
        <div>
          <LinkOut to={{ app: 'bridge', action: 'landing', net }}>
            {t`Send transitions with Bridge`}
          </LinkOut>
        </div>
      </div>
    </Card>
  )
}

function VerifyOutcome({
  result,
}: {
  result: {
    result?: boolean | null | undefined
    error?: string | null | undefined
    code?: number | null | undefined
    info?: string | null | undefined
  }
}) {
  const { t } = useLingui()
  const accepted = result.result === true && !result.error
  return (
    <div
      role="status"
      data-verify={accepted ? 'valid' : 'invalid'}
      className="grid gap-1 rounded-[var(--dh-r2)] border p-3"
      style={{ borderColor: accepted ? 'var(--dh-ok)' : 'var(--dh-bad)' }}
    >
      <p className="font-semibold">
        {accepted
          ? t`Platform would accept this transition.`
          : t`Platform would reject this transition.`}
      </p>
      {result.error ? <p className="rx-mono break-words text-sm">{result.error}</p> : null}
      {result.code !== null && result.code !== undefined && result.code !== 0 ? (
        <p className="text-sm text-[var(--dh-ink-2)]">{t`Error code ${result.code}`}</p>
      ) : null}
      {result.info ? <p className="rx-mono break-words text-sm">{result.info}</p> : null}
    </div>
  )
}

export function TransitionToolPage() {
  const { t } = useLingui()
  const [state, setState] = useState<BytesState>({ text: '', choice: 'auto' })
  const parsed = useParsedBytes(state)
  const decoded = useDecoded('stateTransition', parsed)
  const data =
    decoded.status === 'ok' && isDecodedTransition(decoded.data) ? decoded.data : undefined
  const summary = data ? summarizeTransition(data) : undefined
  const base64 = parsed?.ok ? toBase64(parsed.bytes) : undefined

  return (
    <PageFrame
      path="/tools/transition"
      title={t`Transition decoder`}
      eyebrow={t`Tools`}
      layer="neutral"
      lede={t`Paste a state transition as hex or base64 to decode it. Nothing is signed or broadcast; the optional check sends the transition to Platform Explorer for a dry run.`}
    >
      <Card title={t`Input`} layer="platform">
        <BytesField
          state={state}
          onChange={setState}
          parsed={parsed}
          label={t`Signed state transition`}
          rows={6}
        />
      </Card>
      {decoded.status === 'pending' ? <Skeleton shape="row" count={3} /> : null}
      {decoded.status === 'error' ? (
        <div
          role="alert"
          data-decode-error
          className="grid gap-1 rounded-[var(--dh-r2)] border border-[var(--dh-bad)] p-3"
        >
          <p className="font-semibold">{t`These bytes could not be decoded as a state transition.`}</p>
          <p className="rx-mono break-words text-sm">{decoded.message}</p>
        </div>
      ) : null}
      {data && summary ? (
        <>
          <SummaryCard summary={summary} actionType={data.actionType} />
          <Card title={t`Decoded`} layer="platform" id="decoded">
            <JsonView
              value={data.body ?? data}
              collapsedDepth={2}
              label={t`Decoded JSON`}
              maxHeight={640}
            />
            {data.body === null ? (
              <p className="mt-2 text-sm text-[var(--dh-ink-2)]">
                {t`The SDK reads only the envelope of this transition type; its fields are not shown.`}
              </p>
            ) : null}
          </Card>
        </>
      ) : null}
      <VerifyCard base64={base64} />
    </PageFrame>
  )
}
