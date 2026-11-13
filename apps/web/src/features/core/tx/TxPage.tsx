import { plural } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { instantLockView } from '@/data/core/lock-state'
import { coreQueries } from '@/data/core/queries'
import type { DecodedTx } from '@/data/core/types'
import { stampOf, type SourceStamp } from '@/data/envelope'
import { hyQueries } from '@/data/hyphen/queries'
import { useDocumentTitle, useNetwork } from '@/features/entity'
import { formatBytes, formatInt } from '@/lib/format'
import { formatAmountText } from '@/lib/units'
import { useFollowTip } from '../follow-tip'
import {
  Amount,
  Badge,
  Card,
  ErrorState,
  Hash,
  SourceLine,
  Stat,
  Time,
  TypeBadge,
  useUnits,
  ChainLockBadge,
  InstantSendBadge,
} from '@/ui'
import {
  CoreBand,
  CoreBandSkeleton,
  NotFound,
  RecordHeader,
  Section,
  SectionIndex,
} from '../block/frame'
import { useHyphenFit } from '@/data/hyphen/fit'
import { useIndexHealth } from '@/data/index-health'
import { StaleIndexNotice } from '../hy-shared/HyphenGate'
import { insQueries } from '@/data/insight/queries'
import { insightSpendsOf } from './spend'
import { IoTables } from './IoTables'
import { PayloadRows, usePayloadInfo } from './Payload'
import { txQueries } from './queries'
import { Settlement } from './Settlement'
import { useFirstSeen } from './useFirstSeen'
import { usePrevoutSteps } from './usePrevoutSteps'
import {
  inputValues,
  isCoinbaseTx,
  movesNoValue,
  senderAddresses,
  sumOutputs,
  totals,
  type FlowNode,
} from './tx-info'
import { ValueFlow } from './ValueFlow'

const TXID = /^[0-9a-f]{64}$/i
/** Above this many inputs the page loads previous outputs for the first few and asks before loading the rest. */
const PREVOUT_EAGER = 50
const PREVOUT_FIRST = 10

const short = (a: string) => (a.length > 14 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a)

export function TxPage({ txid }: { txid: string }) {
  const { t } = useLingui()
  const net = useNetwork()
  const valid = TXID.test(txid)
  useDocumentTitle(t`Transaction ${txid.slice(0, 8)}…`)
  const tx = useQuery({ ...coreQueries.tx(net, txid), enabled: valid })
  const found = tx.data?.data
  const tipHeight = useFollowTip(net, {
    keys: [coreQueries.tx(net, txid).queryKey],
    settled: found?.isChainLocked === true,
    enabled: valid,
  })

  if (!valid || tx.data?.data === null) {
    return (
      <NotFound
        title={t`Transaction`}
        net={net}
        path={`/tx/${txid}`}
        what={t`There is no transaction with this ID on this network. It may be too new, or on another network.`}
      />
    )
  }
  if (tx.isError && !tx.data) {
    return (
      <div className="dh-container" style={{ paddingBlock: '48px 80px' }}>
        <ErrorState error={tx.error} source="dapi" onRetry={() => void tx.refetch()} />
      </div>
    )
  }
  if (!tx.data?.data) {
    return <CoreBandSkeleton />
  }
  return (
    <TxView
      key={tx.data.data.txid}
      tx={tx.data.data}
      stamp={stampOf(tx.data)}
      tipHeight={tipHeight}
    />
  )
}

function jsonOf(tx: DecodedTx): string {
  return JSON.stringify(tx, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v), 2)
}

function TxView({
  tx,
  stamp,
  tipHeight,
}: {
  tx: DecodedTx
  stamp: SourceStamp
  tipHeight: number | undefined
}) {
  const { t } = useLingui()
  const net = useNetwork()
  const units = useUnits()
  const confirmations =
    tx.height === undefined
      ? undefined
      : tipHeight === undefined
        ? tx.confirmations
        : Math.max(1, tipHeight - tx.height + 1)
  const coinbase = isCoinbaseTx(tx)
  const mined = tx.height !== undefined
  const count = tx.inputs.length <= PREVOUT_EAGER ? tx.inputs.length : PREVOUT_FIRST
  const needsPrevouts = !coinbase && tx.inputs.length > 0
  const [loadAll, setLoadAll] = useState(false)
  const prevouts = useQuery({ ...txQueries.prevouts(net, tx, count), enabled: needsPrevouts })
  const rest = usePrevoutSteps(net, tx, count, loadAll && needsPrevouts && prevouts.isSuccess)
  const hyphenFit = useHyphenFit(net)
  const hy = useQuery({ ...hyQueries.tx(net, tx.txid), enabled: hyphenFit && mined })
  const index = useIndexHealth(net)
  const insightFirst = index.readFrom === 'insight'
  // The spend state's own reads decide whether Insight is asked; this only watches the answer for its source line.
  const ins = useQuery({ ...insQueries.tx(net, tx.txid), enabled: false })
  const insightSpends = useMemo(() => insightSpendsOf(ins.data?.data), [ins.data])
  const prev = useMemo(() => {
    const first = prevouts.data?.data
    if (!first || rest.map.size === 0) return first
    return new Map([...first, ...rest.map])
  }, [prevouts.data, rest.map])
  const values = useMemo(() => inputValues(tx, prev), [tx, prev])
  const senders = useMemo(() => senderAddresses(values), [values])
  const sums = totals(tx, prev)
  const firstSeen = useFirstSeen(net, tx.txid, { enabled: hyphenFit && !mined })
  const hyFee = hy.data?.data?.fee ?? undefined
  const lockFacts = useMemo(() => ({ ...tx, confirmations }), [tx, confirmations])
  const instant = instantLockView(lockFacts)
  const fee = sums.fee ?? hyFee
  const outTotal = sumOutputs(tx)
  const toOthers = tx.outputs.reduce(
    (s, o) => (o.address && senders.has(o.address) ? s : s + o.value),
    0n,
  )
  const payload = tx.payload
  const info = usePayloadInfo(typeof payload?.kind === 'string' ? payload.kind : undefined)
  const feeStamp: SourceStamp | undefined =
    sums.fee !== undefined
      ? prevouts.data
        ? stampOf(prevouts.data)
        : stamp
      : hy.data
        ? stampOf(hy.data)
        : undefined

  const unloaded = values.filter((v) => v === undefined).length
  const loadedTotal = values.reduce((s, v) => s + (v?.value ?? 0n), 0n)
  const flow = useMemo(() => {
    const missing = outTotal + (fee ?? 0n) - loadedTotal
    const unloadedInput: FlowNode[] =
      unloaded > 0 && missing > 0n
        ? [
            {
              key: 'unloaded',
              label: t`${formatInt(unloaded)} inputs not loaded`,
              value: missing,
              kind: 'in',
            },
          ]
        : []
    const inputs: FlowNode[] = coinbase
      ? [{ key: 'new', label: t`Newly generated coins`, value: outTotal, kind: 'in' }]
      : tx.inputs.length === 0
        ? [{ key: 'pool', label: t`Credit pool`, value: outTotal + (fee ?? 0n), kind: 'in' }]
        : values.every((v) => v === undefined)
          ? [
              {
                key: 'unknown',
                label: t`${formatInt(tx.inputs.length)} inputs`,
                value: outTotal + (fee ?? 0n),
                kind: 'in',
              },
            ]
          : [
              ...tx.inputs.flatMap((_, n) => {
                const v = values[n]
                return v
                  ? [
                      {
                        key: `i${n}`,
                        label: `#${n} ${v.address ? short(v.address) : ''}`.trim(),
                        value: v.value,
                        kind: 'in' as const,
                        address: v.address,
                      },
                    ]
                  : []
              }),
              ...unloadedInput,
            ]
    const outputs: FlowNode[] = tx.outputs.flatMap((o, n) =>
      o.value === 0n
        ? []
        : [
            {
              key: `o${n}`,
              label: `#${n} ${o.address ? short(o.address) : t`data`}`,
              value: o.value,
              kind: o.address && senders.has(o.address) ? ('change' as const) : ('out' as const),
              address: o.address,
            },
          ],
    )
    if (fee !== undefined && fee > 0n)
      outputs.push({ key: 'fee', label: t`Fee`, value: fee, kind: 'fee' })
    return { inputs, outputs }
  }, [coinbase, tx, values, senders, outTotal, fee, unloaded, loadedTotal, t])

  const noValue = movesNoValue(tx)
  const spendsNothing = !coinbase && tx.inputs.length === 0 && fee === 0n
  const feeRate =
    fee !== undefined && tx.size > 0
      ? (Number(fee) / tx.size).toFixed(1).replace(/\.0$/, '')
      : undefined

  let feeNote: string | undefined
  if (fee !== undefined) {
    if (feeRate) {
      feeNote = spendsNothing
        ? t`${feeRate} duffs a byte: it spends no coins`
        : t`${feeRate} duffs a byte`
    }
  } else if (coinbase) {
    feeNote = t`Coinbase transactions pay none`
  } else if ((prevouts.isPending || prevouts.isPlaceholderData) && needsPrevouts) {
    feeNote = t`Loading inputs…`
  } else {
    feeNote = t`Show all inputs to work it out`
  }

  return (
    <article data-page="/tx/$txid" data-layer="core">
      <CoreBand
        crumbs={[
          { label: t`Core`, to: <Link to="/blocks">{t`Core`}</Link> },
          ...(tx.height !== undefined
            ? [
                {
                  label: t`Block`,
                  to: (
                    <Link to="/block/$id" params={{ id: tx.blockHash ?? String(tx.height) }}>
                      {t`Block ${formatInt(tx.height)}`}
                    </Link>
                  ),
                },
              ]
            : [{ label: t`Mempool` }]),
          { label: t`Transaction` },
        ]}
      >
        <RecordHeader
          icon="tx"
          kicker={
            <>
              <TypeBadge type={tx.type} />
              <span>
                {t`Version ${tx.version}`} ·{' '}
                {plural(tx.inputs.length, { one: '# input', other: '# inputs' })},{' '}
                {plural(tx.outputs.length, { one: '# output', other: '# outputs' })}
              </span>
            </>
          }
          title={
            <>
              {t`Transaction`}{' '}
              <span className="rx-mono" style={{ fontSize: '.86em' }}>
                {tx.txid.slice(0, 6)}…{tx.txid.slice(-4)}
              </span>
            </>
          }
          meta={
            <>
              <div className="rx-rec__meta">
                <span className="rx-dim">{t`Txid`}</span>
                <Hash value={tx.txid} display="full" />
              </div>
              <div className="rx-rec__meta">
                {instant.state === 'claimed' || instant.state === 'corroborated' ? (
                  <InstantSendBadge
                    claim={instant.state === 'claimed' ? 'one-node' : undefined}
                    source={instant.source}
                  />
                ) : null}
                <ChainLockBadge locked={tx.isChainLocked === true} claim={tx.chainLockClaim} />
                {mined ? null : <Badge tone="warning">{t`Unconfirmed`}</Badge>}
                {confirmations === undefined || !mined ? null : (
                  <span>
                    {plural(confirmations, { one: '# confirmation', other: '# confirmations' })}
                  </span>
                )}
                <SourceLine stamp={stamp} />
                {hy.data ? <SourceLine stamp={stampOf(hy.data)} /> : null}
              </div>
            </>
          }
        />
        <StaleIndexNotice reads="insight" />
        <div className="rx-kpis">
          <Stat
            size="lg"
            layer="core"
            label={coinbase ? t`Created` : t`Moved`}
            value={<Amount value={outTotal} kind="duffs" fiat />}
            note={
              coinbase
                ? t`Block reward, masternode and fee payments`
                : senders.size > 0
                  ? t`${formatAmountText(toOthers, 'duffs', { unit: units.unit === 'DASH' ? undefined : units.unit, testnet: units.testnet })} to other addresses`
                  : undefined
            }
          />
          <Stat
            label={t`Fee`}
            value={fee === undefined ? '—' : <Amount value={fee} kind="duffs" />}
            note={feeNote}
            source={feeStamp}
          />
          <Stat
            label={t`Size`}
            value={formatInt(tx.size)}
            unit={t`bytes`}
            note={formatBytes(tx.size)}
          />
          <Stat
            label={mined ? t`Mined` : t`Status`}
            value={mined && tx.time ? <Time ms={tx.time} mode="relative" live /> : t`Unconfirmed`}
            note={
              mined && tx.time ? (
                <Time ms={tx.time} mode="absolute" />
              ) : firstSeen ? (
                <>
                  {t`First seen`} <Time ms={firstSeen.at} mode="absolute" />
                </>
              ) : (
                t`In the mempool`
              )
            }
          />
        </div>
      </CoreBand>

      <div className="dh-container" style={{ paddingBlock: '28px 64px' }}>
        {info && payload ? (
        <SectionIndex
          sections={[
            ...(info && payload ? [{ id: 'payload', label: t`Payload` }] : []),
            { id: 'flow', label: t`Value` },
            { id: 'settlement', label: t`Settlement` },
            { id: 'io', label: t`Inputs and outputs` },
            { id: 'raw', label: t`Raw data` },
          ]}
        />
          <Section id="payload" title={info.title} description={info.about} source={stamp}>
            <Card layer="core">
              <div data-payload={String(payload.kind)}>
                <PayloadRows payload={payload} txid={tx.txid} />
              </div>
            </Card>
          </Section>
        ) : null}

        <Section
          id="flow"
          title={t`Where the value went`}
          description={
            noValue
              ? undefined
              : t`Ribbon width is the amount. Grey is change back to the sender, orange is the fee.`
          }
          source={prevouts.data ? [stamp, stampOf(prevouts.data), ...rest.stamps] : stamp}
        >
          <Card layer="core">
            {noValue ? (
              <div data-no-value>
                <p
                  style={{ fontWeight: 600, margin: 0 }}
                >{t`No value moves in this transaction`}</p>
                <p className="rx-note">
                  {t`It spends no coins and creates no outputs, so there is no flow to draw. What it records is in its payload.`}
                </p>
              </div>
            ) : (
              <ValueFlow
                inputs={flow.inputs}
                outputs={flow.outputs}
                caption={t`Value flow: ${formatInt(tx.inputs.length)} inputs into ${formatInt(tx.outputs.length)} outputs`}
              />
            )}
          </Card>
        </Section>

        <Section
          id="settlement"
          title={t`How it settled`}
          description={mined ? undefined : t`Waiting to be mined.`}
          source={[stamp, ...(firstSeen ? [firstSeen.stamp] : [])]}
        >
          <Card layer="core">
            <Settlement tx={lockFacts} coinbase={coinbase} firstSeen={firstSeen} />
          </Card>
        </Section>

        <Section
          id="io"
          title={t`Inputs and outputs`}
          description={
            <>
              {t`Link to one with`} <span className="rx-mono">#in-2</span> {t`or`}{' '}
              <span className="rx-mono">#out-1</span>.
            </>
          }
          source={[
            stamp,
            ...(prevouts.data ? [stampOf(prevouts.data), ...rest.stamps] : []),
            ...(hy.data ? [stampOf(hy.data)] : []),
            ...(insightSpends && ins.data ? [stampOf(ins.data)] : []),
          ]}
        >
          <IoTables
            tx={tx}
            prevouts={prev}
            senders={senders}
            spendContext={{
              mined,
              hy: hy.data ? { detail: hy.data.data, asOfHeight: hy.data.height } : undefined,
              hyLoading: mined && (index.pending || (hyphenFit && hy.isPending)),
              insightFirst,
              tipHeight,
            }}
            partial={
              needsPrevouts && count < tx.inputs.length
                ? {
                    loaded: prevouts.isSuccess ? rest.loaded : 0,
                    requested: loadAll,
                    failed: rest.failed || prevouts.isError,
                  }
                : undefined
            }
            onLoadAll={() => {
              setLoadAll(true)
              if (prevouts.isError) void prevouts.refetch()
              rest.retry()
            }}
          />
        </Section>

        <RawData tx={tx} />
      </div>
    </article>
  )
}

function RawData({ tx }: { tx: DecodedTx }) {
  const { t } = useLingui()
  const [open, setOpen] = useState(false)
  return (
    <details
      className="rx-card dh-disclosure"
      style={{ padding: '14px 20px' }}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary style={{ cursor: 'pointer', fontWeight: 600 }}>{t`Raw data`}</summary>
      {open ? (
        <>
      id="raw"
      data-sec-target
          <p className="rx-note">{t`The transaction as Radar decoded it from DAPI's bytes. Amounts are in duffs.`}</p>
          <pre className="rx-mono" style={{ overflow: 'auto', maxHeight: 420 }}>
            {jsonOf(tx)}
          </pre>
        </>
      ) : null}
    </details>
  )
}
