import type { NetworkId } from '@/lib/network'

/** One recorded SDK exchange, found by `<net>/<method>/<sha256 of the stable JSON of the args>`. */
export interface SdkFixture {
  method: string
  args: unknown
  recordedAt: string
  /** The `WireResult` or `WireError`, in the tagged form of `sdk-codec.ts`. */
  result: unknown
}

const files = import.meta.glob<SdkFixture>('./sdk/*/*/*.json', { import: 'default' })

export async function loadSdkFixture(
  net: NetworkId,
  method: string,
  key: string,
): Promise<SdkFixture | null> {
  const load = files[`./sdk/${net}/${method}/${key}.json`]
  return load ? load() : null
}
