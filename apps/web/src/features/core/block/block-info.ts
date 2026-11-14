import type { DecodedBlock, DecodedTx } from '@/data/core/types'
import { poolOfCoinbase } from '@/lib/core/pools'

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

/**
 * The readable text in a coinbase script. The script also carries the height push, extra-nonce
 * bytes and a signature, so only runs of printable ASCII that look like words are kept.
 */
export function coinbaseTag(coinbase: DecodedTx | undefined): string {
  const hex = coinbase?.inputs[0]?.coinbase
  if (!hex) return ''
  const bytes = hex.match(/../g) ?? []
  const push = parseInt(bytes[0] ?? '', 16)
  const text = bytes
    .slice(push >= 1 && push <= 8 ? push + 1 : 0)
    .map((h) => {
      const code = parseInt(h, 16)
      return code >= 0x20 && code <= 0x7e ? String.fromCharCode(code) : '\n'
    })
    .join('')
  return text
    .split('\n')
    .map((run) => run.trim())
    .filter((run) => (run.match(/[A-Za-z]/g)?.length ?? 0) >= 4)
    .join(' ')
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
