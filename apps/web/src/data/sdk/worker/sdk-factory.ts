import { EvoSDK } from '@dashevo/evo-sdk'
import type { SdkNetworkConfig } from '../methods'
import type { SdkHandle } from './api'
import type { SdkReads } from './impl'

/**
 * Builds a trusted-context SDK for a network (§3.1) and narrows it to `SdkReads`. This is the only file that
 * touches the package, so everything else can be tested without the wasm.
 */
export async function createEvoSdk(cfg: SdkNetworkConfig): Promise<SdkHandle> {
  const protocolVersion = await EvoSDK.getLatestVersionNumber()
  const { retries, banFailedAddress, logs } = cfg.settings ?? {}
  const sdk = new EvoSDK({
    network: cfg.network,
    trusted: true,
    ...(cfg.devnetName ? { devnetName: cfg.devnetName } : {}),
    ...(cfg.quorumUrl ? { quorumUrl: cfg.quorumUrl } : {}),
    ...(cfg.addresses && cfg.addresses.length > 0 ? { addresses: cfg.addresses } : {}),
    ...(logs ? { logs } : {}),
    ...(retries !== undefined || banFailedAddress !== undefined
      ? {
          settings: {
            ...(retries !== undefined ? { retries } : {}),
            ...(banFailedAddress !== undefined ? { banFailedAddress } : {}),
          },
        }
      : {}),
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
