/**
 * The deployed `epoch_time_length_s` of each network, in ms: 9.125 days on mainnet, 1 hour on testnet. A custom devnet
 * may choose another length, so it has none and the clock says the end isn't known.
 */
export function epochLengthMs(net: string): number | undefined {
  if (net === 'mainnet') return 788_400_000
  if (net === 'testnet') return 3_600_000
  return undefined
}
