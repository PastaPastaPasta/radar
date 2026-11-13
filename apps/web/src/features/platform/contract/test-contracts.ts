import type { ContractFullDto } from '@/data/sdk/methods'
import { argsKey, decodeValue } from '@/test/fixtures/sdk-codec'

export const DPNS = 'GWRSAVFMjXx8HpQFaNJMqBV7MBgMK4br5UESsB4S31Ec'
export const DASHPAY = 'Bwr4WHCPz5rFVAD87RqTs3izo4zpzwsEdKPWUT1NS1C7'
export const WITHDRAWALS = '4fJLR2GYTPFdomuTVvNy3VRrvWgvkKPzqehEBpNf2nk6'

const recordings = import.meta.glob<{ result: unknown }>(
  '../../../test/fixtures/sdk/*/contracts.fetch/*.json',
  { eager: true, import: 'default' },
)

/** A recorded `contracts.fetch` answer, as the unit tests of this package read real schemas. */
export function recordedContract(net: 'mainnet' | 'testnet', id: string): ContractFullDto {
  const found =
    recordings[`../../../test/fixtures/sdk/${net}/contracts.fetch/${argsKey({ id })}.json`]
  if (!found) throw new Error(`no recorded contract ${id} on ${net}`)
  return (decodeValue(found.result) as { data: ContractFullDto }).data
}
