import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'

/** What the SDK reads out of a state transition (`decodeWithWasm('stateTransition')`). */
export interface DecodedTransition {
  actionType: string
  actionTypeNumber: number
  hash: string
  ownerId: string | null
  identityNonce: string | null
  identityContractNonce: string | null
  userFeeIncrease: number
  signaturePublicKeyId: number | null
  byteLength: number
  body: Record<string, unknown> | null
}

export type SummaryValue =
  | { kind: 'text'; text: string }
  | { kind: 'number'; value: number | bigint }
  | { kind: 'id'; id: string; entity?: 'identity' | 'contract' | 'token' | 'masternode' }

export interface SummaryRow {
  label: MessageDescriptor
  value: SummaryValue
}

/** One document or token operation inside a batch. */
export interface BatchOperation {
  action: string
  /** A document type's name; absent for a token operation. */
  type: string | undefined
  contractId: string | undefined
  /** The document's or the token's id. */
  id: string | undefined
}

export interface TransitionSummary {
  name: string
  label: MessageDescriptor
  rows: SummaryRow[]
  operations: BatchOperation[]
}

const LABELS: Record<string, MessageDescriptor> = {
  DataContractCreate: msg`Data contract create`,
  DataContractUpdate: msg`Data contract update`,
  DocumentsBatch: msg`Documents and tokens batch`,
  IdentityCreate: msg`Identity create`,
  IdentityTopUp: msg`Identity top-up`,
  IdentityUpdate: msg`Identity update`,
  IdentityCreditWithdrawal: msg`Credit withdrawal`,
  IdentityCreditTransfer: msg`Credit transfer`,
  MasternodeVote: msg`Masternode vote`,
  AddressFundsTransfer: msg`Platform address transfer`,
  AddressFundingFromAssetLock: msg`Platform address funding`,
  AddressCreditWithdrawal: msg`Platform address withdrawal`,
  IdentityCreateFromAddresses: msg`Identity create from addresses`,
  IdentityTopUpFromAddresses: msg`Identity top-up from addresses`,
  Shield: msg`Shield`,
  ShieldFromAssetLock: msg`Shield from asset lock`,
  ShieldFromIdentity: msg`Shield from identity`,
  ShieldedTransfer: msg`Shielded transfer`,
  ShieldedWithdrawal: msg`Shielded withdrawal`,
  Unshield: msg`Unshield`,
}

const UNKNOWN = msg`State transition`

export const nameOfAction = (actionType: string): string => actionType.replace(/\(.*$/, '')

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])
const str = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined)
const num = (value: unknown): number | undefined =>
  typeof value === 'number' ? value : typeof value === 'bigint' ? Number(value) : undefined

export function isDecodedTransition(value: unknown): value is DecodedTransition {
  return (
    isRecord(value) &&
    typeof value.actionType === 'string' &&
    typeof value.hash === 'string' &&
    typeof value.byteLength === 'number'
  )
}

function operationOf(transition: Record<string, unknown>): BatchOperation {
  const token = transition.$transition === 'token' || '$tokenId' in transition
  const action = str(transition.$action) ?? ''
  return {
    action,
    type: token ? undefined : str(transition.$type),
    contractId: str(transition.$dataContractId),
    id: token ? str(transition.$tokenId) : str(transition.$id),
  }
}

function addressTotal(entries: unknown[]): number {
  return entries.reduce<number>((sum, e) => sum + (isRecord(e) ? (num(e.amount) ?? 0) : 0), 0)
}

function detailRows(name: string, body: Record<string, unknown>): SummaryRow[] {
  const rows: SummaryRow[] = []
  const text = (label: MessageDescriptor, value: string | undefined) => {
    if (value !== undefined) rows.push({ label, value: { kind: 'text', text: value } })
  }
  const number = (label: MessageDescriptor, value: number | undefined) => {
    if (value !== undefined) rows.push({ label, value: { kind: 'number', value } })
  }
  const id = (
    label: MessageDescriptor,
    value: string | undefined,
    entity?: 'identity' | 'contract' | 'masternode',
  ) => {
    if (value !== undefined)
      rows.push({ label, value: { kind: 'id', id: value, ...(entity ? { entity } : {}) } })
  }
  switch (name) {
    case 'DataContractCreate':
    case 'DataContractUpdate': {
      const contract = isRecord(body.dataContract) ? body.dataContract : {}
      id(msg`Contract`, str(contract.id), 'contract')
      number(msg`Contract version`, num(contract.version))
      const types = isRecord(contract.documentSchemas) ? Object.keys(contract.documentSchemas) : []
      if (types.length > 0) text(msg`Document types`, types.join(', '))
      break
    }
    case 'IdentityUpdate':
      number(msg`Revision`, num(body.revision))
      number(msg`Keys added`, list(body.addPublicKeys).length)
      number(msg`Keys disabled`, list(body.disablePublicKeys).length)
      break
    case 'IdentityCreditWithdrawal':
      number(msg`Amount (credits)`, num(body.amount))
      text(msg`Pooling`, str(body.pooling))
      number(msg`Core fee per byte`, num(body.coreFeePerByte))
      break
    case 'IdentityTopUp':
    case 'IdentityCreate':
      id(msg`Identity`, str(body.identityId), 'identity')
      break
    case 'MasternodeVote': {
      const vote = isRecord(body.vote) ? body.vote : {}
      const poll = isRecord(vote.votePoll) ? vote.votePoll : {}
      const choice = isRecord(vote.resourceVoteChoice) ? vote.resourceVoteChoice : {}
      id(msg`Masternode`, str(body.proTxHash))
      id(msg`Contract`, str(poll.contractId), 'contract')
      text(msg`Document type`, str(poll.documentTypeName))
      const values = list(poll.indexValues).filter((v): v is string => typeof v === 'string')
      if (values.length > 0) text(msg`Contested name`, values.join('.'))
      text(msg`Vote`, str(choice.$type))
      break
    }
    case 'AddressFundsTransfer':
    case 'AddressFundingFromAssetLock': {
      const inputs = list(body.inputs)
      const outputs = list(body.outputs)
      number(msg`Inputs`, inputs.length)
      number(msg`Outputs`, outputs.length)
      if (inputs.length > 0) number(msg`Credits in`, addressTotal(inputs))
      if (outputs.length > 0 && outputs.every((o) => isRecord(o) && num(o.amount) !== undefined))
        number(msg`Credits out`, addressTotal(outputs))
      break
    }
    default:
      if (list(body.actions).length > 0) number(msg`Shielded actions`, list(body.actions).length)
  }
  return rows
}

/** The facts a reader wants first, drawn from the decoded transition. */
export function summarizeTransition(decoded: DecodedTransition): TransitionSummary {
  const name = nameOfAction(decoded.actionType)
  const body = decoded.body
  const nonce = decoded.identityContractNonce ?? decoded.identityNonce
  const rows: SummaryRow[] = [{ label: msg`Hash`, value: { kind: 'id', id: decoded.hash } }]
  if (decoded.ownerId)
    rows.push({
      label: msg`Sender`,
      value: { kind: 'id', id: decoded.ownerId, entity: 'identity' },
    })
  if (nonce !== null)
    rows.push({ label: msg`Nonce`, value: { kind: 'number', value: BigInt(nonce) } })
  rows.push({
    label: msg`Fee multiplier`,
    value: { kind: 'number', value: decoded.userFeeIncrease },
  })
  if (decoded.signaturePublicKeyId !== null)
    rows.push({
      label: msg`Signing key`,
      value: { kind: 'number', value: decoded.signaturePublicKeyId },
    })
  rows.push({ label: msg`Size (bytes)`, value: { kind: 'number', value: decoded.byteLength } })
  if (body) rows.push(...detailRows(name, body))
  const operations =
    name === 'DocumentsBatch' && body
      ? list(body.transitions).filter(isRecord).map(operationOf)
      : []
  return { name, label: LABELS[name] ?? UNKNOWN, rows, operations }
}
