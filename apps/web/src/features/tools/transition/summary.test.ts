import { describe, expect, it } from 'vitest'
import { i18n } from '@lingui/core'
import { summarizeTransition, type DecodedTransition } from './summary'

const base: DecodedTransition = {
  actionType: 'IdentityTopUp',
  actionTypeNumber: 3,
  hash: 'ab'.repeat(32),
  ownerId: 'BjixEUbqeUZK7BRdqtLgjzwFBovx4BRwS2iwhMriiYqp',
  identityNonce: null,
  identityContractNonce: null,
  userFeeIncrease: 0,
  signaturePublicKeyId: null,
  byteLength: 543,
  body: { identityId: 'BjixEUbqeUZK7BRdqtLgjzwFBovx4BRwS2iwhMriiYqp' },
}
const labels = (decoded: DecodedTransition) =>
  summarizeTransition(decoded).rows.map((r) => i18n._(r.label))

describe('summarizeTransition', () => {
  it('names the type and the envelope facts', () => {
    const s = summarizeTransition(base)
    expect(i18n._(s.label)).toBe('Identity top-up')
    expect(labels(base)).toEqual(['Hash', 'Sender', 'Fee multiplier', 'Size (bytes)', 'Identity'])
  })

  it('lists the operations of a batch, documents and tokens alike', () => {
    const s = summarizeTransition({
      ...base,
      actionType: 'DocumentsBatch([Create, TokenTransfer])',
      identityContractNonce: '7',
      signaturePublicKeyId: 4,
      body: {
        transitions: [
          {
            $transition: 'document',
            $action: 'create',
            $type: 'domain',
            $dataContractId: 'C',
            $id: 'D',
          },
          { $transition: 'token', $action: 'transfer', $dataContractId: 'C', $tokenId: 'T' },
        ],
      },
    })
    expect(s.operations).toEqual([
      { action: 'create', type: 'domain', contractId: 'C', id: 'D' },
      { action: 'transfer', type: undefined, contractId: 'C', id: 'T' },
    ])
    expect(s.name).toBe('DocumentsBatch')
    expect(s.rows.some((r) => r.value.kind === 'number' && r.value.value === 7n)).toBe(true)
  })

  it('reads a withdrawal and a vote', () => {
    const withdrawal = summarizeTransition({
      ...base,
      actionType: 'IdentityCreditWithdrawal',
      body: { amount: 190000, pooling: 'never', coreFeePerByte: 1 },
    })
    expect(
      labels({ ...base, actionType: 'IdentityCreditWithdrawal', body: { amount: 1 } }),
    ).toContain('Amount (credits)')
    expect(withdrawal.rows.at(-3)?.value).toEqual({ kind: 'number', value: 190000 })
    const vote = summarizeTransition({
      ...base,
      actionType: 'MasternodeVote',
      body: {
        proTxHash: 'P',
        vote: {
          votePoll: { contractId: 'C', documentTypeName: 'domain', indexValues: ['dash', 'name'] },
          resourceVoteChoice: { $type: 'abstain' },
        },
      },
    })
    const text = vote.rows.map((r) => (r.value.kind === 'text' ? r.value.text : ''))
    expect(text).toContain('dash.name')
    expect(text).toContain('abstain')
  })

  it('totals the credits of an address transfer', () => {
    const s = summarizeTransition({
      ...base,
      actionType: 'AddressFundsTransfer',
      ownerId: null,
      body: { inputs: [{ amount: 10 }, { amount: 5 }], outputs: [{ amount: 14 }] },
    })
    const get = (label: string) =>
      s.rows.find((r) => i18n._(r.label) === label)?.value as { value: number } | undefined
    expect(get('Credits in')?.value).toBe(15)
    expect(get('Credits out')?.value).toBe(14)
  })

  it('has only the envelope when the SDK reads no body', () => {
    const s = summarizeTransition({ ...base, actionType: 'IdentityCreditTransfer', body: null })
    expect(i18n._(s.label)).toBe('Credit transfer')
    expect(s.rows.length).toBe(4)
  })

  it('names an unknown type plainly', () => {
    expect(
      i18n._(summarizeTransition({ ...base, actionType: 'Something', body: null }).label),
    ).toBe('State transition')
  })
})
