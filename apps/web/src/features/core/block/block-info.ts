import type { DecodedBlock, DecodedTx } from '@/data/core/types'
import { coinbaseTagOf, poolOfCoinbase } from '@/lib/core/pools'

/**
 * Difficulty from the compact target, the way Dash Core prints it: the target a difficulty-1 block
 * would have (0x00ffff at shift 29) divided by this block's target.
 */
export function difficultyFromBits(bitsHex: string): number {
  const bits = parseInt(bitsHex, 16)
  let shift = bits >>> 24
  const mantissa = bits & 0x00ffffff
  if (mantissa === 0) return 0
  let diff = 0x0000ffff / mantissa
  while (shift < 29) {
    diff *= 256
    shift++
  }
  while (shift > 29) {
    diff /= 256
    shift--
  }
  return diff
}

export function coinbaseTag(coinbase: DecodedTx | undefined): string {
  return coinbaseTagOf(coinbase?.inputs[0]?.coinbase)
}

/** The pool named in the coinbase script, or undefined when the script carries no known tag. */
export function poolOf(coinbase: DecodedTx | undefined): string | undefined {
  return poolOfCoinbase(coinbase?.inputs[0]?.coinbase)
}

/** Everything the coinbase pays out: the subsidy, the masternode share and the fees. */
export function blockReward(block: Pick<DecodedBlock, 'txs'>): bigint {
  return (block.txs[0]?.outputs ?? []).reduce((sum, o) => sum + o.value, 0n)
}

export function cbTxOf(
  block: Pick<DecodedBlock, 'txs'>,
): (Record<string, unknown> & { kind: 'cbTx' }) | undefined {
  const payload = block.txs[0]?.payload
  return payload?.kind === 'cbTx'
    ? (payload as Record<string, unknown> & { kind: 'cbTx' })
    : undefined
}
