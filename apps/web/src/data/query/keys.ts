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
  return [net]
}

function compact(params: KeyParams): KeyParams | undefined {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined)
  if (entries.length === 0) return undefined
  return Object.fromEntries(entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
}

export function queryKey<S extends QueryKeySource>(
  net: NetworkId,
  source: S,
  resource: string,
  params?: KeyParams,
): QueryKeyOf<S> {
  const p = params && compact(params)
  return p ? [net, source, resource, p] : [net, source, resource]
}

const factory =
  <S extends QueryKeySource>(source: S): KeyFactory<S> =>
  (net, resource, params) =>
    queryKey(net, source, resource, params)

export const radarKeys: KeyFactory<'radar'> = factory('radar')
export const peKeys: KeyFactory<'pe'> = factory('pe')
export const hyKeys: KeyFactory<'hyphen'> = factory('hyphen')
export const insKeys: KeyFactory<'insight'> = factory('insight')
export const dapiKeys: KeyFactory<'dapi'> = factory('dapi')
export const viewKeys: KeyFactory<'view'> = factory('view')
export const rateKeys: KeyFactory<'rate'> = factory('rate')
export const healthKeys: KeyFactory<'health'> = factory('health')

function stableStringify(value: unknown): string {
  if (typeof value === 'bigint') return `"${value}n"`
  if (value instanceof Uint8Array)
    return `"u8:${Array.from(value, (b) => b.toString(16).padStart(2, '0')).join('')}"`
  if (value instanceof Map) {
    return stableStringify(
      Object.fromEntries(
        [...value.entries()].sort(([a], [b]) => String(a).localeCompare(String(b))),
      ),
    )
  }
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort()
    const parts: string[] = []
    for (const k of keys) {
      const v = (value as Record<string, unknown>)[k]
      if (v !== undefined) parts.push(`${JSON.stringify(k)}:${stableStringify(v)}`)
    }
    return `{${parts.join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

/** `[net, 'sdk', method, { args }]`: the SDK's args are structured, so they are folded into one stable string. */
export function sdkKeys<M extends SdkMethodName>(
  net: NetworkId,
  method: M,
  args: SdkMethods[M]['args'],
): QueryKeyOf<'sdk'> {
  const flat = flattenArgs(args)
  return queryKey(net, 'sdk', method, flat)
}

function flattenArgs(args: unknown): KeyParams | undefined {
  if (!args || typeof args !== 'object') return undefined
  const out: Record<string, string | number | boolean | null | undefined> = {}
  for (const [k, v] of Object.entries(args as Record<string, unknown>)) {
    if (v === undefined) continue
    out[k] =
      v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
        ? v
        : stableStringify(v)
  }
  return out
}
