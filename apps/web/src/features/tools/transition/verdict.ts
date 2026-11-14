import { msg } from '@lingui/core/macro'
import type { MessageDescriptor } from '@lingui/core'
import type { PeVerify } from '@/data/pe'

export type Verdict =
  | { kind: 'accepted' }
  | {
      kind: 'rejected'
      name: string | undefined
      code: number | undefined
      raw: string | undefined
    }

/** What Platform says about the consensus errors people meet most; any other is shown by its name. */
const KNOWN: Record<string, MessageDescriptor> = {
  InvalidIdentityNonceError: msg`The identity nonce has already been used, or is not the next one.`,
  BalanceIsNotEnoughError: msg`The identity does not have enough balance for the fee.`,
  DocumentAlreadyPresentError: msg`A document with this ID already exists.`,
  DataContractAlreadyPresentError: msg`A data contract with this ID already exists.`,
  IdentityAlreadyExistsError: msg`An identity with this ID already exists.`,
  InvalidStateTransitionSignatureError: msg`The signature does not match the signing key.`,
}

export const knownReason = (name: string | undefined): MessageDescriptor | undefined =>
  name === undefined ? undefined : KNOWN[name]

const CONSENSUS_NAME = /^[A-Z][A-Za-z0-9]+Error$/

/** Reads Platform Explorer's CheckTx answer: accepted only when it says so, otherwise a rejection with what it said. */
export function readVerdict(answer: PeVerify): Verdict {
  const { result, error, code } = answer
  const failed = Boolean(error) || result === false || result === 'error' || (code ?? 0) !== 0
  if (!failed && (result === true || result === 'ok' || code === 0)) return { kind: 'accepted' }
  const named = error !== undefined && error !== null && CONSENSUS_NAME.test(error)
  return {
    kind: 'rejected',
    name: named ? error : undefined,
    code: code ?? undefined,
    raw: error && !named ? error : undefined,
  }
}
