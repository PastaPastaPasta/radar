import { EvoSDK, Identity, StateTransition } from '@dashevo/evo-sdk'
import type { SdkNetworkConfig } from '../methods'
import type { SdkHandle } from './api'
import type { SdkReads } from './impl'

/**
 * Builds a trusted-context SDK for a network (§3.1) and narrows it to `SdkReads`. This is the only file that
 * touches the package, so everything else can be tested without the wasm.
 */
export async function createEvoSdk(cfg: SdkNetworkConfig): Promise<SdkHandle> {
  const protocolVersion = await EvoSDK.getLatestVersionNumber()
  const sdk = new EvoSDK({
    network: cfg.network,
    trusted: true,
    ...(cfg.devnetName ? { devnetName: cfg.devnetName } : {}),
    ...(cfg.quorumUrl ? { quorumUrl: cfg.quorumUrl } : {}),
    ...(cfg.addresses && cfg.addresses.length > 0 ? { addresses: cfg.addresses } : {}),
  })
  await sdk.connect()
  return {
    reads: sdk as unknown as SdkReads,
    protocolVersion,
    free: () => {
      sdk.wasm.free()
    },
  }
}

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
