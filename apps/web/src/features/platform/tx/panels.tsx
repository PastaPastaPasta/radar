import { useLingui } from '@lingui/react/macro'
import type { ReactNode } from 'react'
import type { StateTransitionDecodedDto } from '@/data/sdk/methods/p-blocks'
import { Entity } from '@/features/entity'
import { formatInt } from '@/lib/format'
import type { NetworkId } from '@/lib/network'
import { Badge, Hash } from '@/ui'
import {
  humanize,
  isRecord,
  list,
  num,
  proTxHashHex,
  records,
  str,
  type Json,
} from './decoded'
import {
  Address,
  AddressTable,
  ContractRef,
  Credits,
  Facts,
  FeeStrategy,
  Fields,
  Funding,
  KeysTable,
  Script,
  Who,
  type Fact,
} from './panel-parts'

interface PanelProps {
  body: Json
  net: NetworkId
}

const count = (v: unknown): ReactNode => formatInt(list(v).length)

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-4">
      <h3 className="rx-eyebrow mb-2">{title}</h3>
      {children}
    </section>
  )
}

function ContractPanel({ body }: PanelProps) {
  const { t } = useLingui()
  const contract = isRecord(body.dataContract) ? body.dataContract : {}
  const types = isRecord(contract.documentSchemas) ? Object.keys(contract.documentSchemas) : []
  const tokens = isRecord(contract.tokens) ? Object.keys(contract.tokens).length : 0
  return (
    <>
      <Facts
        items={[
          { label: t`Contract`, value: <ContractRef id={contract.id} /> },
          { label: t`Owner`, value: <Who id={contract.ownerId} /> },
          { label: t`Version`, value: num(contract.version) ?? '—' },
          {
            label: t`Document types`,
            value: types.length === 0 ? '—' : `${formatInt(types.length)}: ${types.join(', ')}`,
          },
          { label: t`Tokens`, value: formatInt(tokens) },
          { label: t`Keywords`, value: list(contract.keywords).join(', ') || '—' },
        ]}
      />
      <Fields value={body} label={t`Contract as sent`} />
    </>
  )
}

function IdentityCreatePanel({ body }: PanelProps) {
  const { t } = useLingui()
  return (
    <>
      <Facts items={[{ label: t`Funded by`, value: <Funding proof={body.assetLockProof} /> }]} />
      <Section title={t`Keys`}>
        <KeysTable keys={records(body.publicKeys)} caption={t`Keys of the new identity`} />
      </Section>
      <Fields value={body} label={t`Fields as sent`} />
    </>
  )
}

function TopUpPanel({ body }: PanelProps) {
  const { t } = useLingui()
  return (
    <>
      <Facts
        items={[
          { label: t`Identity`, value: <Who id={body.identityId} /> },
          { label: t`Funded by`, value: <Funding proof={body.assetLockProof} /> },
        ]}
      />
      <Fields value={body} label={t`Fields as sent`} />
    </>
  )
}

function IdentityUpdatePanel({ body }: PanelProps) {
  const { t } = useLingui()
  const added = records(body.addPublicKeys)
  const disabled = list(body.disablePublicKeys)
  return (
    <>
      <Facts
        items={[
          { label: t`Identity`, value: <Who id={body.identityId} /> },
          { label: t`Revision`, value: num(body.revision) ?? '—' },
          { label: t`Keys added`, value: formatInt(added.length) },
          {
            label: t`Keys disabled`,
            value: disabled.length === 0 ? '0' : disabled.map((k) => `#${String(k)}`).join(', '),
          },
        ]}
      />
      {added.length > 0 ? (
        <Section title={t`Keys added`}>
          <KeysTable keys={added} caption={t`Keys added by this update`} />
        </Section>
      ) : null}
      <Fields value={body} label={t`Fields as sent`} />
    </>
  )
}

function IdentityWithdrawalPanel({ body, net }: PanelProps) {
  const { t } = useLingui()
  return (
    <>
      <Facts
        items={[
          { label: t`Identity`, value: <Who id={body.identityId} /> },
          { label: t`Amount`, value: <Credits value={body.amount} /> },
          { label: t`Pays out to`, value: body.outputScript == null ? t`The identity's withdrawal address` : <Script base64={body.outputScript} net={net} /> },
          { label: t`Core fee per byte`, value: num(body.coreFeePerByte) ?? '—' },
          { label: t`Pooling`, value: str(body.pooling) ?? '—' },
        ]}
      />
      <Fields value={body} label={t`Fields as sent`} />
    </>
  )
}

function CreditTransferPanel({ body }: PanelProps) {
  const { t } = useLingui()
  return (
    <>
      <Facts
        items={[
          { label: t`From`, value: <Who id={body.identityId} /> },
          { label: t`To`, value: <Who id={body.recipientId} /> },
          { label: t`Amount`, value: <Credits value={body.amount} /> },
        ]}
      />
      <Fields value={body} label={t`Fields as sent`} />
    </>
  )
}

function VotePanel({ body }: PanelProps) {
  const { t } = useLingui()
  const vote = isRecord(body.vote) ? body.vote : {}
  const poll = isRecord(vote.votePoll) ? vote.votePoll : {}
  const choice = isRecord(vote.resourceVoteChoice) ? vote.resourceVoteChoice : {}
  const values = list(poll.indexValues).map(String)
  const proTx = str(body.proTxHash)
  const proTxHex = proTx ? proTxHashHex(proTx) : undefined
  const contract = str(poll.contractId)
  const type = str(poll.documentTypeName)
  const index = str(poll.indexName)
  const label = values.length > 0 ? values[values.length - 1] : undefined
  const pick = str(choice.$type)
  return (
    <>
      <Facts
        items={[
          {
            label: t`Evonode`,
            value: proTxHex ? <Entity kind="evonode" id={proTxHex} /> : (proTx ?? '—'),
          },
          { label: t`Voter identity`, value: <Who id={body.voterIdentityId} /> },
          { label: t`Contract`, value: <ContractRef id={poll.contractId} /> },
          {
            label: t`Poll`,
            value:
              label && contract && type && index ? (
                <Entity
                  kind="contest"
                  id={label}
                  search={{ contract, type, index }}
                  label={values.join(' · ')}
                />
              ) : (
                values.join(' · ') || '—'
              ),
          },
          {
            label: t`Choice`,
            value:
              pick === 'towardsIdentity' || str(choice.identity) ? (
                <Who id={choice.identity} />
              ) : pick === 'abstain' ? (
                t`Abstain`
              ) : pick === 'lock' ? (
                t`Lock`
              ) : (
                (pick ?? '—')
              ),
          },
        ]}
      />
      <Fields value={body} label={t`Fields as sent`} />
    </>
  )
}

function AddressPanel({ body, net }: PanelProps) {
  const { t } = useLingui()
  const inputs = records(body.inputs)
  const outputs = records(body.outputs ?? body.recipientAddresses)
  const lone = isRecord(body.output) ? body.output : undefined
  const outputRows = lone ? [lone, ...outputs] : outputs
  const facts: Fact[] = []
  if (body.identityId !== undefined)
    facts.push({ label: t`Identity`, value: <Who id={body.identityId} /> })
  if (body.assetLockProof !== undefined)
    facts.push({ label: t`Funded by`, value: <Funding proof={body.assetLockProof} /> })
  if (body.coreFeePerByte !== undefined)
    facts.push({ label: t`Core fee per byte`, value: num(body.coreFeePerByte) ?? '—' })
  if (body.pooling !== undefined) facts.push({ label: t`Pooling`, value: str(body.pooling) ?? '—' })
  if (body.outputScript !== undefined)
    facts.push({
      label: t`Pays out to`,
      value: <Script base64={body.outputScript} net={net} />,
    })
  if (body.feeStrategy !== undefined)
    facts.push({ label: t`Fee paid from`, value: <FeeStrategy value={body.feeStrategy} /> })
  return (
    <>
      <Facts items={facts} />
      {inputs.length > 0 ? (
        <Section title={t`Inputs`}>
          <AddressTable rows={inputs} net={net} nonce caption={t`Addresses that pay`} />
        </Section>
      ) : null}
      {outputRows.length > 0 ? (
        <Section title={t`Outputs`}>
          <AddressTable rows={outputRows} net={net} caption={t`Addresses that receive`} />
        </Section>
      ) : null}
      {records(body.publicKeys).length > 0 ? (
        <Section title={t`Keys`}>
          <KeysTable keys={records(body.publicKeys)} caption={t`Keys of the new identity`} />
        </Section>
      ) : null}
      <Fields value={body} label={t`Fields as sent`} />
    </>
  )
}

/** Shielded types: the note actions are cryptographic payloads, so only their count and the amounts that cross the pool boundary are read out. */
function ShieldedPanel({ body, net }: PanelProps) {
  const { t } = useLingui()
  const facts: Fact[] = [{ label: t`Shielded actions`, value: count(body.actions) }]
  const amount = body.amount ?? body.unshieldingAmount ?? body.valueBalance
  if (amount !== undefined) facts.push({ label: t`Amount across the pool`, value: <Credits value={amount} /> })
  if (body.denomination !== undefined)
    facts.push({ label: t`Denomination`, value: <Credits value={body.denomination} /> })
  if (body.outputAddress !== undefined)
    facts.push({ label: t`Output address`, value: <Address hex={body.outputAddress} net={net} /> })
  if (body.assetLockProof !== undefined)
    facts.push({ label: t`Funded by`, value: <Funding proof={body.assetLockProof} /> })
  if (body.identityId !== undefined)
    facts.push({ label: t`Identity`, value: <Who id={body.identityId} /> })
  if (body.outputScript !== undefined)
    facts.push({ label: t`Pays out to`, value: <Script base64={body.outputScript} net={net} /> })
  if (body.anchor !== undefined)
    facts.push({ label: t`Anchor`, value: <Hash value={str(body.anchor) ?? ''} /> })
  const inputs = records(body.inputs)
  return (
    <>
      <Facts items={facts} />
      {inputs.length > 0 ? (
        <Section title={t`Inputs`}>
          <AddressTable rows={inputs} net={net} nonce caption={t`Addresses that pay`} />
        </Section>
      ) : null}
      <Fields value={body} label={t`Fields as sent`} />
    </>
  )
}

function BatchEntry({ entry, index }: { entry: Json; index: number }) {
  const { t } = useLingui()
  const kind = str(entry.$transition)
  const action = str(entry.$action)
  const contract = str(entry.$dataContractId)
  const type = str(entry.$type)
  const id = str(entry.$id)
  const token = str(entry.$tokenId)
  const amount = entry.amount ?? entry.$amount
  const price = entry.$price ?? entry.price
  const recipient = entry.recipientOwnerId ?? entry.recipientId ?? entry.issuedToIdentityId
  const facts: Fact[] = []
  if (token) facts.push({ label: t`Token`, value: <Entity kind="token" id={token} /> })
  if (contract && type && id)
    facts.push({
      label: t`Document`,
      value: <Entity kind="document" id={`${contract}/${type}/${id}`} />,
    })
  if (contract)
    facts.push({ label: t`Contract`, value: <ContractRef id={contract} /> })
  if (type) facts.push({ label: t`Document type`, value: type })
  if (entry.$revision !== undefined) facts.push({ label: t`Revision`, value: num(entry.$revision) ?? '—' })
  if (amount !== undefined) facts.push({ label: t`Amount`, value: formatInt(num(amount) ?? 0) })
  if (price !== undefined) facts.push({ label: t`Price`, value: <Credits value={price} /> })
  if (recipient != null) facts.push({ label: t`Recipient`, value: <Who id={recipient} /> })
  if (str(entry.publicNote)) facts.push({ label: t`Note`, value: str(entry.publicNote) })
  return (
    <section className="mt-4" data-batch-entry={index}>
      <h3 className="rx-eyebrow mb-2">
        {t`Action ${index + 1}`}{' '}
        <Badge>{humanize(`${kind ?? 'document'}_${action ?? ''}`.replace(/_$/, ''))}</Badge>
      </h3>
      <Facts items={facts} />
    </section>
  )
}

function BatchPanel({ body }: PanelProps) {
  const { t } = useLingui()
  const entries = records(body.transitions)
  return (
    <>
      <Facts
        items={[
          { label: t`Sent by`, value: <Who id={body.ownerId} /> },
          { label: t`Actions`, value: formatInt(entries.length) },
        ]}
      />
      {entries.map((entry, i) => (
        <BatchEntry key={`${i}:${str(entry.$id) ?? str(entry.$tokenId) ?? ''}`} entry={entry} index={i} />
      ))}
      <Fields value={body} label={t`Fields as sent`} />
    </>
  )
}

const PANELS: Partial<Record<number, (p: PanelProps) => ReactNode>> = {
  0: ContractPanel,
  1: BatchPanel,
  2: IdentityCreatePanel,
  3: TopUpPanel,
  4: ContractPanel,
  5: IdentityUpdatePanel,
  6: IdentityWithdrawalPanel,
  7: CreditTransferPanel,
  8: VotePanel,
  9: AddressPanel,
  10: AddressPanel,
  11: AddressPanel,
  12: AddressPanel,
  13: AddressPanel,
  14: AddressPanel,
  15: ShieldedPanel,
  16: ShieldedPanel,
  17: ShieldedPanel,
  18: ShieldedPanel,
  19: ShieldedPanel,
  20: ShieldedPanel,
}

/** The fields of a transition by its type, or just the tree for a type with no readable layout. */
export function TypePanel({
  decoded,
  net,
}: {
  decoded: StateTransitionDecodedDto
  net: NetworkId
}) {
  const { t } = useLingui()
  const body = isRecord(decoded.body) ? decoded.body : undefined
  if (!body) return null
  const Panel = PANELS[decoded.typeNumber]
  return Panel ? (
    <Panel body={body} net={net} />
  ) : (
    <Fields value={body} label={t`Fields as sent`} />
  )
}
