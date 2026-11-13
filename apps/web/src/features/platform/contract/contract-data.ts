import { useQuery } from '@tanstack/react-query'
import { peQueries } from '@/data/pe/queries'
import { useDecentralizedOnly } from '@/data/health'
import { sdkQueries } from '@/data/sdk/queries'
import type { ContractFullDto } from '@/data/sdk/methods'
import { isPlatformId } from '@/lib/base58'
import { isDevnet, type NetworkId } from '@/lib/network'
import { wellKnownLabel } from '@/lib/well-known'

/** The contract from the SDK, proof-checked; nothing is asked for an id that cannot be a contract's. */
export function useContract(net: NetworkId, id: string) {
  return useQuery({
    ...sdkQueries['contracts.fetch'](net, { id }),
    enabled: isPlatformId(id),
  })
}

/** Platform Explorer is asked only on the networks it covers and while the mode allows it. */
export function usePeEnabled(net: NetworkId): boolean {
  const off = useDecentralizedOnly()
  return !off && !isDevnet(net)
}

export function usePeContract(net: NetworkId, id: string) {
  const enabled = usePeEnabled(net) && isPlatformId(id)
  return useQuery({ ...peQueries.dataContract(net, id), enabled })
}

/** Well-known contracts name themselves; others take Platform Explorer's name when it has one. */
export function contractName(net: NetworkId, id: string, peName: string | null | undefined) {
  return wellKnownLabel(net, 'contract', id) ?? (peName ? peName : undefined)
}

/** Whether a document type keeps every revision: its own flag, else the contract's default. */
export function typeKeepsHistory(contract: ContractFullDto, type: string): boolean {
  const schema = contract.documentSchemas[type] as { documentsKeepHistory?: unknown } | undefined
  if (typeof schema?.documentsKeepHistory === 'boolean') return schema.documentsKeepHistory
  return contract.config.documentsKeepHistoryContractDefault === true
}

export const typeNames = (contract: ContractFullDto): string[] =>
  Object.keys(contract.documentSchemas)

/** Top-level property names of a type, in the order the schema positions them. */
export function propertyNames(schema: unknown): string[] {
  const props = (schema as { properties?: Record<string, { position?: unknown }> } | undefined)
    ?.properties
  if (!props) return []
  return Object.entries(props)
    .sort(([, a], [, b]) => Number(a.position ?? 0) - Number(b.position ?? 0))
    .map(([name]) => name)
}
