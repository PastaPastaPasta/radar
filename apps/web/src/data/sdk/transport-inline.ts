import type { SdkTransport } from './client'
import { createSdkWorkerApi } from './worker/api'

/** The same implementation on the main thread, for environments without module workers. Loaded only when asked for. */
export async function createInlineTransport(): Promise<SdkTransport> {
  const { createEvoSdk, decodeWithWasm } = await import('./worker/sdk-factory')
  return createSdkWorkerApi({ createSdk: createEvoSdk, decode: decodeWithWasm })
}
