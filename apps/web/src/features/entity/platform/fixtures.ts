import type { PeBlockSummary, PeTransaction } from '@/data/pe/schemas'

export const NOW = Date.UTC(2026, 10, 10, 12, 0, 0)
export const HASH = 'AB'.repeat(32)
export const OWNER = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec'

export function transition(over: Partial<PeTransaction> = {}): PeTransaction {
  return {
    hash: HASH,
    index: 0,
    blockHeight: 468960,
    type: 'BATCH',
    batchType: 'DOCUMENT_CREATE',
    timestamp: NOW - 60_000,
    gasUsed: 1234567,
    status: 'SUCCESS',
    owner: { identifier: OWNER, aliases: [] },
    ...over,
  }
}

export function block(
  height: number,
  over: Partial<PeBlockSummary['header']> = {},
): PeBlockSummary {
  return {
    header: {
      hash: 'CD'.repeat(32),
      height,
      timestamp: NOW - 180_000,
      validator: 'EF'.repeat(32),
      totalGasUsed: 0,
      ...over,
    },
    txs: [{}, {}],
  }
}
