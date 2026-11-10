import { plural } from '@lingui/core/macro'
import { useLingui } from '@lingui/react/macro'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { coreQueries } from '@/data/core/queries'
import type { DecodedTx } from '@/data/core/types'
import { stampOf, type SourceStamp } from '@/data/envelope'
import { hyQueries } from '@/data/hyphen/queries'
import { useDocumentTitle, useNetwork } from '@/features/entity'
import { formatBytes, formatInt } from '@/lib/format'
import { formatAmountText } from '@/lib/units'
import {
  Amount,
  Badge,
  Card,
  ErrorState,
  Hash,
  Icon,
  Skeleton,
  SourceLine,
  Stat,
  Time,
  TypeBadge,
} from '@/ui'
import { CoreBand, NotFound, RecordHeader, Section } from '../block/frame'
import { useHyphenFit } from '../block/use-hyphen-fit'
import { IoTables } from './IoTables'
import { PayloadRows, usePayloadInfo } from './Payload'
import { txQueries } from './queries'
import { Settlement } from './Settlement'
import {
  inputValues,
  isCoinbaseTx,
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

  if (!valid || tx.data?.data === null) {
    return (
      <NotFound
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
    return (
      <CoreBand crumbs={[]} current="/blocks">
        <div className="rx-rec" aria-busy="true">
          <h1 className="rx-rec__title" id="h-page">
            <Skeleton shape="line" width="40%" />
          </h1>
        </div>
        <div className="rx-kpis">
          <Skeleton shape="stat" count={4} />
        </div>
      </CoreBand>
    )
  }
  return <TxView tx={tx.data.data} stamp={stampOf(tx.data)} />
}

function jsonOf(tx: DecodedTx): string {
  return JSON.stringify(tx, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v), 2)
}

function TxView({ tx, stamp }: { tx: DecodedTx; stamp: SourceStamp }) {
  const { t } = useLingui()
  const net = useNetwork()
  const coinbase = isCoinbaseTx(tx)
  const mined = tx.height !== undefined
  const [count, setCount] = useState(
    tx.inputs.length <= PREVOUT_EAGER ? tx.inputs.length : PREVOUT_FIRST,
  )
  const needsPrevouts = !coinbase && tx.inputs.length > 0
  const prevouts = useQuery({ ...txQueries.prevouts(net, tx, count), enabled: needsPrevouts })
  const hyphenFit = useHyphenFit(net)
  const hy = useQuery({ ...hyQueries.tx(net, tx.txid), enabled: hyphenFit && mined })
  const prev = prevouts.data?.data
  const values = useMemo(() => inputValues(tx, prev), [tx, prev])
  const senders = useMemo(() => senderAddresses(values), [values])
  const sums = totals(tx, prev)
  const hyFee = hy.data?.data?.fee ?? undefined
  const fee = sums.fee ?? hyFee
  const outTotal = sumOutputs(tx)
  const spent = hy.data?.data
    ? tx.outputs.map((_, n) => hy.data?.data?.vout.find((v) => v.n === n)?.spent)
    : undefined
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

  const flow = useMemo(() => {
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
          : tx.inputs.flatMap((_, n) => {
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
            })
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
  }, [coinbase, tx, values, senders, outTotal, fee, t])

  const feeRate =
    fee !== undefined && tx.size > 0
      ? (Number(fee) / tx.size).toFixed(1).replace(/\.0$/, '')
      : undefined
  const confirmations = tx.confirmations

  return (
    <article data-page="/tx/$txid" data-layer="core">
      <CoreBand
        current="/blocks"
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
                {tx.isInstantLocked ? (
                  <Badge tone="success" icon={<Icon name="is" size="sm" />}>
                    {t`InstantSend locked`}
                  </Badge>
                ) : null}
                {tx.isChainLocked ? (
                  <Badge tone="success" icon={<Icon name="cl" size="sm" />}>
                    {t`ChainLocked`}
                  </Badge>
                ) : null}
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
                  ? t`${formatAmountText(toOthers, 'duffs')} to other addresses`
                  : undefined
            }
          />
          <Stat
            label={t`Fee`}
            value={fee === undefined ? '—' : <Amount value={fee} kind="duffs" />}
            note={
              fee !== undefined
                ? feeRate
                  ? t`${feeRate} duffs a byte`
                  : undefined
                : coinbase
                  ? t`Coinbase transactions pay none`
                  : prevouts.isPending && needsPrevouts
                    ? t`Loading inputs…`
                    : t`Load all inputs to work it out`
            }
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
            value={mined && tx.time ? <Time ms={tx.time} mode="absolute" /> : t`Unconfirmed`}
            note={mined && tx.time ? <Time ms={tx.time} mode="relative" live /> : t`In the mempool`}
          />
        </div>
      </CoreBand>

      <div className="dh-container" style={{ paddingBlock: '28px 64px' }}>
        {info && payload ? (
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
          description={t`Ribbon width is the amount. Grey is change back to the sender, orange is the fee.`}
          source={prevouts.data ? [stamp, stampOf(prevouts.data)] : stamp}
        >
          <Card layer="core">
            <ValueFlow
              inputs={flow.inputs}
              outputs={flow.outputs}
              caption={t`Value flow: ${formatInt(tx.inputs.length)} inputs into ${formatInt(tx.outputs.length)} outputs`}
            />
          </Card>
        </Section>

        <Section
          id="settlement"
          title={t`How it settled`}
          description={mined ? undefined : t`Waiting to be mined.`}
          source={stamp}
        >
          <Card layer="core">
            <Settlement tx={tx} coinbase={coinbase} />
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
            ...(prevouts.data ? [stampOf(prevouts.data)] : []),
            ...(hy.data ? [stampOf(hy.data)] : []),
          ]}
        >
          <IoTables
            tx={tx}
            prevouts={prev}
            senders={senders}
            spent={spent}
            partial={needsPrevouts ? { loaded: count, loading: prevouts.isFetching } : undefined}
            onLoadAll={() => setCount(tx.inputs.length)}
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
          <p className="rx-note">{t`The transaction as Radar decoded it from DAPI's bytes. Amounts are in duffs.`}</p>
          <pre className="rx-mono" style={{ overflow: 'auto', maxHeight: 420 }}>
            {jsonOf(tx)}
          </pre>
        </>
      ) : null}
    </details>
  )
}
