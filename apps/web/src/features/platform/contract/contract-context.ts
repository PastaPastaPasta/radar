import type { SourceStamp } from '@/data/envelope'
import type { ContractFullDto } from '@/data/sdk/methods'
import type { NetworkId } from '@/lib/network'

export type ContractTab =
  | 'overview'
  | 'schema'
  | 'types'
  | 'tokens'
  | 'groups'
  | 'history'
  | 'config'
  | 'transactions'
  | 'documents'

/** The address's search on `/contract/$id`, as the page and its tabs read it. */
export interface ContractPageSearch {
  tab: ContractTab
  type?: string | undefined
  owner?: string | undefined
  page: number
  rev?: number | undefined
  path?: string | undefined
  base?: number | undefined
  from?: string | undefined
  to?: string | undefined
}

export interface ContractContext {
  net: NetworkId
  id: string
  contract: ContractFullDto
  /** The proof-checked read of the contract. */
  stamp: SourceStamp
  search: ContractPageSearch
}
