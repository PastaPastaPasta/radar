import type { NetworkId } from './network'

/** Dash Core's `CoinJoin::vecStandardDenominations`, in duffs: 10, 1, 0.1, 0.01 and 0.001 DASH, each plus a ten-thousandth. */
export const COINJOIN_DENOMINATIONS: readonly bigint[] = [
  1_000_010_000n,
  100_001_000n,
  10_000_100n,
  1_000_010n,
  100_001n,
]

/** `CoinJoin::IsDenominatedAmount`. */
export const isDenominatedAmount = (duffs: bigint): boolean =>
  COINJOIN_DENOMINATIONS.includes(duffs)

/** `nPoolMinParticipants`: 3 on mainnet, 2 on testnet and devnets. */
const minParticipants = (net: NetworkId): number => (net === 'mainnet' ? 3 : 2)

/** `nPoolMaxParticipants` (20) × `COINJOIN_ENTRY_MAX_SIZE` (9). */
const MAX_INPUTS = 180

const P2PKH = /^76a914[0-9a-f]{40}88ac$/i

/**
 * A CoinJoin mixing transaction, by the shape Dash Core's `CCoinJoinBroadcastTx::IsValidStructure` requires of one
 * before V24: as many inputs as outputs, at least the pool's minimum and at most 180, and every output a P2PKH paying a
 * standard denomination. Inputs and outputs then sum the same, so it pays no fee.
 */
export function isCoinJoinMix(
  tx: { inputs: number; outputs: readonly { value: bigint; scriptPubKey: string }[] },
  net: NetworkId,
): boolean {
  const n = tx.outputs.length
  return (
    n === tx.inputs &&
    n >= minParticipants(net) &&
    n <= MAX_INPUTS &&
    tx.outputs.every((o) => isDenominatedAmount(o.value) && P2PKH.test(o.scriptPubKey))
  )
}

/** What an index's list row says about a transaction: Hyphen gives counts on block lists and a fee on address lists. */
export interface TxRowFacts {
  txType: string
  valueOut: bigint
  inputCount?: number
  outputCount?: number
  fee?: bigint | null
}

/**
 * The same test from an index's list row, which has a total but no outputs: a plain transaction whose total is a whole
 * number of one denomination, with as many inputs as outputs when the row counts them, or no fee when it gives one (only
 * a mixing transaction is relayed without one). A row that says neither, or mixes denominations, is not labelled.
 */
export function looksLikeCoinJoinMix(row: TxRowFacts, net: NetworkId): boolean {
  if (row.txType !== 'normal') return false
  let n: number
  if (row.inputCount !== undefined && row.outputCount !== undefined) {
    if (row.inputCount !== row.outputCount) return false
    n = row.outputCount
    if (!COINJOIN_DENOMINATIONS.some((d) => d * BigInt(n) === row.valueOut)) return false
  } else if (row.fee === 0n) {
    const d = COINJOIN_DENOMINATIONS.find((x) => row.valueOut % x === 0n)
    if (d === undefined) return false
    n = Number(row.valueOut / d)
  } else {
    return false
  }
  return n >= minParticipants(net) && n <= MAX_INPUTS
}
