import type { NetworkId } from '@/lib/network'
import type { SourceId } from '../envelope'
import type { SdkMethodName, SdkMethods } from '../sdk/methods'

export type KeyParams = Readonly<Record<string, string | number | boolean | null | undefined>>
export type QueryKeySource = SourceId | 'view' | 'health'
export type QueryKeyOf<S extends QueryKeySource = QueryKeySource> = readonly [
  net: NetworkId,
  source: S,
  resource: string,
  params?: KeyParams,
]

export type KeyFactory<S extends QueryKeySource> = (
  net: NetworkId,
  resource: string,
  params?: KeyParams,
) => QueryKeyOf<S>

/** Prefix matching every query of a network, for `removeQueries` and `invalidateQueries`. */
export function netKey(net: NetworkId): readonly [NetworkId] {
  void net
  throw new Error('not implemented')
}

export function queryKey<S extends QueryKeySource>(
  net: NetworkId,
  source: S,
  resource: string,
  params?: KeyParams,
): QueryKeyOf<S> {
  void net
  void source
  void resource
  void params
  throw new Error('not implemented')
}

export const radarKeys: KeyFactory<'radar'> = () => {
  throw new Error('not implemented')
}
export const peKeys: KeyFactory<'pe'> = () => {
  throw new Error('not implemented')
}
export const hyKeys: KeyFactory<'hyphen'> = () => {
  throw new Error('not implemented')
}
export const dapiKeys: KeyFactory<'dapi'> = () => {
  throw new Error('not implemented')
}
export const viewKeys: KeyFactory<'view'> = () => {
  throw new Error('not implemented')
}

export function sdkKeys<M extends SdkMethodName>(
  net: NetworkId,
  method: M,
  args: SdkMethods[M]['args'],
): QueryKeyOf<'sdk'> {
  void net
  void method
  void args
  throw new Error('not implemented')
}
