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

const byDirectory = new Map<string, Promise<SdkFixture[]>>()

/**
 * Every recording of one method on one network, newest first. Read lazily, once, and only when a composed answer needs
 * them: the e2e bundle still fetches no recording that no call asks for.
 */
export function listSdkFixtures(net: NetworkId, method: string): Promise<SdkFixture[]> {
  const dir = `./sdk/${net}/${method}/`
  let list = byDirectory.get(dir)
  if (!list) {
    list = Promise.all(
      Object.entries(files)
        .filter(([path]) => path.startsWith(dir))
        .map(([, load]) => load()),
    ).then((all) =>
      all.sort((a, b) => (a.recordedAt < b.recordedAt ? 1 : a.recordedAt > b.recordedAt ? -1 : 0)),
    )
    byDirectory.set(dir, list)
  }
  return list
}
