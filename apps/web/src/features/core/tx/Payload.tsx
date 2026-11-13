import { useLingui } from '@lingui/react/macro'
import type { ReactNode } from 'react'
import { Entity, IdentityRef, PageLink } from '@/features/entity'
import { formatInt, formatPercent } from '@/lib/format'
import { Amount, Hash, KeyValue } from '@/ui'
import { useFundedIdentities } from './funded-identity'
import { REVOKE_REASONS } from './revoke-reason'
import { stampOf, type SourceStamp } from '@/data/envelope'

interface Item {
  label: ReactNode
  value: ReactNode
  source?: SourceStamp
}
type Obj = Record<string, unknown>

interface Script {
  hex?: string
  address?: string | null
  scriptType?: string
}
interface Service {
  address?: string | null
}

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)
const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined)
const big = (v: unknown): bigint | undefined => (typeof v === 'bigint' ? v : undefined)
const obj = (v: unknown): Obj | undefined =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : undefined
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

function hashValue(v: unknown, head = 12, tail = 8): ReactNode {
  const s = str(v)
  return s ? <Hash value={s} display="short" head={head} tail={tail} /> : null
}

function fullHash(v: unknown): ReactNode {
  const s = str(v)
  return s ? <Hash value={s} display="wrap" phoneShort /> : null
}

function addressOf(k: unknown): ReactNode {
  const a = str(obj(k)?.address)
  return a ? <Entity kind="address" id={a} /> : null
}

function scriptValue(v: unknown, none: ReactNode): ReactNode {
  const script = obj(v) as Script | undefined
  if (!script) return none
  if (script.address) return <Entity kind="address" id={script.address} />
  return script.hex ? <span className="rx-mono">{script.hex}</span> : none
}

/** Rows for the coinbase payload, shared by the block page and the coinbase transaction. */
export function CbTxRows({ payload: p }: { payload: Obj }) {
  const { t } = useLingui()
  const missing = t`Not in this version`
  const bestHeight = num(p.bestClHeight)
  const pool = big(p.creditPoolBalance)
  const items: Item[] = [
    { label: t`Payload version`, value: String(num(p.version) ?? '') },
    { label: t`Block height`, value: formatInt(num(p.height) ?? 0) },
    {
      label: t`Best ChainLock`,
      value: bestHeight === undefined ? missing : formatInt(bestHeight),
    },
    {
      label: t`Credit pool balance`,
      value: pool === undefined ? missing : <Amount value={pool} kind="duffs" />,
    },
    { label: t`ChainLock signature`, value: hashValue(p.bestClSignature) ?? missing },
    { label: t`Masternode list root`, value: fullHash(p.merkleRootMnList) },
    { label: t`Quorums root`, value: fullHash(p.merkleRootQuorums) ?? missing },
    ...(str(p.merkleRootAssetUnlocks)
      ? [{ label: t`Asset unlocks root`, value: fullHash(p.merkleRootAssetUnlocks) }]
      : []),
  ]
  return <KeyValue columns={2} items={items} />
}

function ProRegRows({ p, txid }: { p: Obj; txid: string }) {
  const { t } = useLingui()
  const evo = num(p.masternodeType) === 1
  const collateral = obj(p.collateralOutpoint)
  const payouts = list(p.payouts)
  const service = (obj(p.service) as Service | undefined)?.address
  const platformNodeId = str(p.platformNodeId)
  const shared = obj(p.sharedCollateral)
  const sharedPenalty = big(shared?.earlyPenalty)
  return (
    <KeyValue
      columns={2}
      items={[
        {
          label: t`Masternode`,
          value: <Entity kind={evo ? 'evonode' : 'masternode'} id={txid} />,
        },
        { label: t`Type`, value: evo ? t`Evonode (high-performance)` : t`Regular masternode` },
        {
          label: t`Service address`,
          value: service ? <span className="rx-mono">{service}</span> : '—',
        },
        {
          label: t`Collateral`,
          value: p.collateralInTx ? (
            t`Output ${num(collateral?.vout) ?? 0} of this transaction`
          ) : (
            <Entity
              kind="tx"
              id={str(collateral?.txid) ?? ''}
              label={`${(str(collateral?.txid) ?? '').slice(0, 8)}…:${num(collateral?.vout) ?? 0}`}
            />
          ),
        },
        { label: t`Owner key`, value: addressOf(p.ownerKey) },
        { label: t`Voting key`, value: addressOf(p.votingKey) },
        { label: t`Operator public key`, value: hashValue(p.operatorPublicKey, 16, 8) },
        {
          label: t`Operator reward`,
          value: formatPercent((num(p.operatorReward) ?? 0) / 10000, 2),
        },
        {
          label: t`Payout`,
          value:
            payouts.length > 0
              ? payouts.map((x, i) => (
                  <div key={i}>
                    {scriptValue(obj(x)?.script, '—')} ·{' '}
                    {formatPercent((num(obj(x)?.reward) ?? 0) / 10000, 2)}
                  </div>
                ))
              : scriptValue(p.scriptPayout, '—'),
        },
        ...(evo && platformNodeId
          ? [
              { label: t`Platform node ID`, value: hashValue(platformNodeId, 10, 8) },
              {
                label: t`Platform ports`,
                value: t`P2P ${num(p.platformP2pPort) ?? '—'}, HTTPS ${num(p.platformHttpPort) ?? '—'}`,
              },
            ]
          : []),
        ...(shared
          ? [
              {
                label: t`Shared collateral`,
                value: t`${formatInt(list(shared.shares).length)} shares, ${formatInt(num(shared.earlyPeriodBlocks) ?? 0)} blocks of early-leave penalty`,
              },
              ...(sharedPenalty === undefined
                ? []
                : [
                    {
                      label: t`Early-leave penalty`,
                      value: <Amount value={sharedPenalty} kind="duffs" />,
                    },
                  ]),
            ]
          : []),
      ]}
    />
  )
}

function ProUpServRows({ p }: { p: Obj }) {
  const { t } = useLingui()
  const service = (obj(p.service) as Service | undefined)?.address
  const evo = num(p.mnType) === 1 || str(p.platformNodeId) !== undefined
  return (
    <KeyValue
      columns={2}
      items={[
        {
          label: t`Masternode`,
          value: <Entity kind={evo ? 'evonode' : 'masternode'} id={str(p.proTxHash) ?? ''} />,
        },
        {
          label: t`New service address`,
          value: service ? <span className="rx-mono">{service}</span> : '—',
        },
        { label: t`Operator payout`, value: scriptValue(p.scriptOperatorPayout, t`None`) },
        ...(str(p.platformNodeId)
          ? [
              { label: t`Platform node ID`, value: hashValue(p.platformNodeId, 10, 8) },
              {
                label: t`Platform ports`,
                value: t`P2P ${num(p.platformP2pPort) ?? '—'}, HTTPS ${num(p.platformHttpPort) ?? '—'}`,
              },
            ]
          : []),
        { label: t`Operator signature`, value: hashValue(p.payloadSig) },
      ]}
    />
  )
}

function ProUpRegRows({ p }: { p: Obj }) {
  const { t } = useLingui()
  const payouts = list(p.payouts)
  return (
    <KeyValue
      columns={2}
      items={[
        { label: t`Masternode`, value: <Entity kind="masternode" id={str(p.proTxHash) ?? ''} /> },
        { label: t`New operator key`, value: hashValue(p.operatorPublicKey, 16, 8) },
        { label: t`New voting key`, value: addressOf(p.votingKey) },
        {
          label: t`Payout`,
          value:
            payouts.length > 0
              ? payouts.map((x, i) => <div key={i}>{scriptValue(obj(x)?.script, '—')}</div>)
              : scriptValue(p.scriptPayout, '—'),
        },
        { label: t`Owner signature`, value: hashValue(p.payloadSig) },
      ]}
    />
  )
}

function ProUpRevRows({ p }: { p: Obj }) {
  const { t, i18n } = useLingui()
  const reason = num(p.reason)
  const named = reason === undefined ? undefined : REVOKE_REASONS[reason]
  const name = named ? i18n._(named) : undefined
  return (
    <KeyValue
      columns={2}
      items={[
        { label: t`Masternode`, value: <Entity kind="masternode" id={str(p.proTxHash) ?? ''} /> },
        {
          label: t`Reason`,
          value:
            reason === undefined ? (
              '—'
            ) : (
              <span data-reason={reason}>
                {name ? t`${name} (reason ${reason})` : t`Unknown reason ${reason}`}
              </span>
            ),
          hint: t`Names follow Dash Core’s definitions of the revocation reason codes.`,
        },
        { label: t`Operator signature`, value: hashValue(p.payloadSig) },
      ]}
    />
  )
}

function QcTxRows({ p }: { p: Obj }) {
  const { t } = useLingui()
  const c = obj(p.commitment) ?? {}
  const members = str(c.signers)?.length ?? 0
  return (
    <KeyValue
      columns={2}
      items={[
        { label: t`Quorum type`, value: str(c.llmqTypeName) ?? '—' },
        { label: t`Quorum hash`, value: fullHash(c.quorumHash) },
        ...(num(c.quorumIndex) === undefined
          ? []
          : [{ label: t`Quorum index`, value: String(num(c.quorumIndex)) }]),
        { label: t`Mined for height`, value: formatInt(num(p.height) ?? 0) },
        {
          label: t`Signers`,
          value: t`${formatInt(num(c.signersCount) ?? 0)} of ${formatInt(members)}`,
        },
        {
          label: t`Valid members`,
          value: t`${formatInt(num(c.validMembersCount) ?? 0)} of ${formatInt(members)}`,
        },
        { label: t`Quorum public key`, value: hashValue(c.quorumPublicKey, 16, 8) },
        { label: t`Threshold signature`, value: hashValue(c.thresholdSig) },
      ]}
    />
  )
}

function MnhfRows({ p }: { p: Obj }) {
  const { t } = useLingui()
  return (
    <KeyValue
      columns={2}
      items={[
        { label: t`Version bit`, value: String(num(p.versionBit) ?? '') },
        { label: t`Signing quorum`, value: fullHash(p.quorumHash) },
        { label: t`Signature`, value: hashValue(p.sig) },
      ]}
    />
  )
}

function AssetLockRows({ p, txid }: { p: Obj; txid: string }) {
  const { t } = useLingui()
  const outputs = list(p.creditOutputs)
  const total = big(p.totalCredit)
  const funded = useFundedIdentities(txid, outputs.length)
  return (
    <KeyValue
      columns={2}
      items={[
        {
          label: t`Credited on Platform`,
          value: total === undefined ? '—' : <Amount value={total} kind="duffs" />,
        },
        {
          label: t`Identity created`,
          value: !funded.ready ? (
            '…'
          ) : funded.found.length > 0 ? (
            <div>
              {funded.found.map((f) => (
                <div key={f.id}>
                  <IdentityRef id={f.id} />
                </div>
              ))}
            </div>
          ) : (
            t`None. A top-up credits an identity that already existed.`
          ),
          ...(funded.source ? { source: stampOf(funded.source) } : {}),
        },
        {
          label: t`Credit outputs`,
          value: outputs.map((o, i) => {
            const value = big(obj(o)?.value)
            const addr = str(obj(o)?.address)
            return (
              <div key={i}>
                {value === undefined ? null : <Amount value={value} kind="duffs" />}
                {addr ? (
                  <>
                    {' '}
                    · <Entity kind="address" id={addr} />
                  </>
                ) : null}
              </div>
            )
          }),
        },
      ]}
    />
  )
}

function AssetUnlockRows({ p }: { p: Obj }) {
  const { t } = useLingui()
  const fee = big(p.fee)
  const height = num(p.requestHeight)
  return (
    <KeyValue
      columns={2}
      items={[
        { label: t`Withdrawal index`, value: String(num(p.index) ?? '') },
        { label: t`Fee`, value: fee === undefined ? '—' : <Amount value={fee} kind="duffs" /> },
        {
          label: t`Requested at height`,
          value: height === undefined ? '—' : <Entity kind="block" id={String(height)} />,
        },
        {
          label: t`On Platform`,
          value: (
            <PageLink
              to="/platform/txs"
              search={{ type: 'identity-credit-withdrawal,address-credit-withdrawal' }}
            >
              {t`Withdrawals on Platform`}
            </PageLink>
          ),
        },
        { label: t`Signing quorum`, value: fullHash(p.quorumHash) },
        { label: t`Quorum signature`, value: hashValue(p.quorumSig) },
      ]}
    />
  )
}

function SignatureRows({ p }: { p: Obj }) {
  const signatures = list(p.signatures)
  return signatures.length === 0 ? null : (
    <>
      {signatures.map((sig, i) => (
        <div key={i}>{hashValue(sig, 16, 8)}</div>
      ))}
    </>
  )
}

function ProDissolveRows({ p }: { p: Obj }) {
  const { t } = useLingui()
  return (
    <KeyValue
      columns={2}
      items={[
        { label: t`Masternode`, value: <Entity kind="masternode" id={str(p.proTxHash) ?? ''} /> },
        { label: t`Share index`, value: String(num(p.actorIndex) ?? '') },
        { label: t`Signatures`, value: <SignatureRows p={p} /> },
      ]}
    />
  )
}

function ProUpShareRows({ p }: { p: Obj }) {
  const { t } = useLingui()
  return (
    <KeyValue
      columns={2}
      items={[
        { label: t`Masternode`, value: <Entity kind="masternode" id={str(p.proTxHash) ?? ''} /> },
        { label: t`Share index`, value: String(num(p.shareIndex) ?? '') },
        { label: t`New reward payout`, value: scriptValue(p.scriptReward, t`None`) },
        { label: t`Inputs hash`, value: fullHash(p.inputsHash) },
        { label: t`Signature`, value: hashValue(p.payloadSig) },
      ]}
    />
  )
}

function ProUpSharedRegRows({ p }: { p: Obj }) {
  const { t } = useLingui()
  return (
    <KeyValue
      columns={2}
      items={[
        { label: t`Masternode`, value: <Entity kind="masternode" id={str(p.proTxHash) ?? ''} /> },
        { label: t`Operator public key`, value: hashValue(p.operatorPublicKey, 16, 8) },
        { label: t`Voting key`, value: addressOf(p.votingKey) },
        { label: t`Inputs hash`, value: fullHash(p.inputsHash) },
        { label: t`Signatures`, value: <SignatureRows p={p} /> },
      ]}
    />
  )
}

function GenericRows({ p }: { p: Obj }) {
  const { t } = useLingui()
  const kind = str(p.kind) ?? 'raw'
  return (
    <KeyValue
      columns={1}
      items={[
        { label: t`Payload`, value: <span className="rx-mono">{kind}</span> },
        ...(str(p.hex)
          ? [
              {
                label: t`Raw payload`,
                value: <span className="rx-mono rx-wrap">{str(p.hex)}</span>,
              },
            ]
          : []),
      ]}
    />
  )
}

export interface PayloadInfo {
  title: string
  about: string
}

/** What the payload is, in plain words, for the section head. */
export function usePayloadInfo(kind: string | undefined): PayloadInfo | undefined {
  const { t } = useLingui()
  switch (kind) {
    case undefined:
      return undefined
    case 'proRegTx':
      return {
        title: t`Masternode registration`,
        about: t`Registers a masternode or evonode and sets the keys that run it.`,
      }
    case 'proUpServTx':
      return {
        title: t`Masternode service update`,
        about: t`The operator announces a new network address for a masternode.`,
      }
    case 'proUpRegTx':
      return {
        title: t`Masternode registrar update`,
        about: t`The owner changes a masternode's operator key, voting key or payout.`,
      }
    case 'proUpRevTx':
      return {
        title: t`Masternode revocation`,
        about: t`The operator ends a masternode's service; it must be registered again to return.`,
      }
    case 'proDissolveTx':
      return {
        title: t`Shared masternode dissolved`,
        about: t`The shareholders end a shared masternode and take their collateral back.`,
      }
    case 'proUpShareTx':
      return {
        title: t`Share payout update`,
        about: t`A shareholder of a shared masternode changes where their reward is paid.`,
      }
    case 'proUpSharedRegTx':
      return {
        title: t`Shared masternode registrar update`,
        about: t`The shareholders change a shared masternode's operator key or voting key.`,
      }
    case 'cbTx':
      return {
        title: t`Coinbase payload`,
        about: t`Commits the block to the masternode list and the latest ChainLock.`,
      }
    case 'qcTx':
      return {
        title: t`Quorum commitment`,
        about: t`Records that a quorum finished its key generation and who signed.`,
      }
    case 'mnhfTx':
      return {
        title: t`Hard-fork signal`,
        about: t`A quorum signals that masternodes are ready for a protocol upgrade.`,
      }
    case 'assetLockTx':
      return {
        title: t`Asset lock`,
        about: t`Locks Dash on Core to create credits on Platform.`,
      }
    case 'assetUnlockTx':
      return {
        title: t`Asset unlock`,
        about: t`Pays out a Platform withdrawal from the credit pool.`,
      }
    default:
      return {
        title: t`Special transaction payload`,
        about: t`Radar shows this payload type as raw data.`,
      }
  }
}

export function PayloadRows({ payload, txid }: { payload: Obj; txid: string }) {
  switch (payload.kind) {
    case 'proRegTx':
      return <ProRegRows p={payload} txid={txid} />
    case 'proUpServTx':
      return <ProUpServRows p={payload} />
    case 'proUpRegTx':
      return <ProUpRegRows p={payload} />
    case 'proUpRevTx':
      return <ProUpRevRows p={payload} />
    case 'proDissolveTx':
      return <ProDissolveRows p={payload} />
    case 'proUpShareTx':
      return <ProUpShareRows p={payload} />
    case 'proUpSharedRegTx':
      return <ProUpSharedRegRows p={payload} />
    case 'cbTx':
      return <CbTxRows payload={payload} />
    case 'qcTx':
      return <QcTxRows p={payload} />
    case 'mnhfTx':
      return <MnhfRows p={payload} />
    case 'assetLockTx':
      return <AssetLockRows p={payload} txid={txid} />
    case 'assetUnlockTx':
      return <AssetUnlockRows p={payload} />
    default:
      return <GenericRows p={payload} />
  }
}
