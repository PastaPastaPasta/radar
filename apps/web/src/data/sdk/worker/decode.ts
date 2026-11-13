import { EvoSDK, Identity, StateTransition } from '@dashevo/evo-sdk'

interface Decodable {
  toJSON(): unknown
  free?: () => void
}

/** Local decoding for the tools (no network). */
export async function decodeWithWasm(
  kind: 'stateTransition' | 'dataContract' | 'document' | 'identity',
  bytes: Uint8Array,
): Promise<unknown> {
  await EvoSDK.getLatestVersionNumber()
  let value: Decodable
  if (kind === 'stateTransition') value = (StateTransition as unknown as FromBytes).fromBytes(bytes)
  else if (kind === 'identity') value = (Identity as unknown as FromBytes).fromBytes(bytes)
  else
    throw Object.assign(new Error(`Decoding a ${kind} needs its contract; not offered yet`), {
      name: 'InvalidArgument',
    })
  const json = value.toJSON()
  value.free?.()
  return json
}

interface FromBytes {
  fromBytes(bytes: Uint8Array): Decodable
}
