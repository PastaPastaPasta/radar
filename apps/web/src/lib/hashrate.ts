import { digitsFor, formatNumber } from './format'

const HASH_UNITS: [number, string][] = [
  [1e18, 'EH/s'],
  [1e15, 'PH/s'],
  [1e12, 'TH/s'],
  [1e9, 'GH/s'],
  [1e6, 'MH/s'],
  [1e3, 'kH/s'],
]

/** A hash rate in the largest unit it reaches; `resolve` is the smallest difference the reader needs to see. */
export function formatHashrate(hps: number, resolve?: number): string {
  const [scale, unit] = HASH_UNITS.find(([s]) => hps >= s) ?? [1, 'H/s']
  const digits = resolve === undefined ? 2 : Math.max(2, digitsFor(resolve / scale))
  const shown =
    resolve === undefined
      ? formatNumber(hps / scale, { maximumFractionDigits: 2 })
      : formatNumber(hps / scale, { minimumFractionDigits: digits, maximumFractionDigits: digits })
  return `${shown} ${unit}`
}

/** Dash Core's block target: one block every 2.5 minutes. */
const BLOCK_SECONDS = 150

/**
 * The hash rate a difficulty implies: the expected hashes per block (difficulty × 2³², as Bitcoin's difficulty 1 is
 * 2³² hashes) over the 150 second block target. It is an estimate, not a measurement of the miners.
 */
export const hashrateFromDifficulty = (difficulty: number): number =>
  (difficulty * 2 ** 32) / BLOCK_SECONDS
